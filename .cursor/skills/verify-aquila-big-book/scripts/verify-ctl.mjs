#!/usr/bin/env node
/**
 * Launch, check, and stop the Aquila Big Book verification server.
 *
 *   node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs launch
 *   node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs doctor
 *   node .cursor/skills/verify-aquila-big-book/scripts/verify-ctl.mjs cleanup
 *
 * Scratch state lives in .cursor/skills/verify-aquila-big-book/run/.
 * Evidence in .cursor/skills/verify-aquila-big-book/evidence/ is never deleted.
 */
import { execFileSync, spawn } from "node:child_process";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const skillDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(skillDir, "..", "..", "..");
const runDir = join(skillDir, "run");
const statePath = join(runDir, "state.json");
const logPath = join(runDir, "dev.log");
const port = Number(process.env.VERIFY_PORT || 4173);
const readyTimeoutMs = Number(process.env.VERIFY_READY_TIMEOUT_MS || 90000);

function fail(message) {
  console.error(message);
  process.exit(1);
}

function readState() {
  if (!existsSync(statePath)) return null;
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function listeningPids(targetPort) {
  let output = "";
  try {
    output = execFileSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8" });
  } catch (error) {
    fail(`netstat failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const pids = new Set();
  for (const line of output.split(/\r?\n/)) {
    if (!line.includes("LISTENING")) continue;
    const parts = line.trim().split(/\s+/);
    const local = parts[1] ?? "";
    if (local.endsWith(`:${targetPort}`)) {
      pids.add(parts[parts.length - 1]);
    }
  }
  return [...pids];
}

function processAlive(pid) {
  try {
    const output = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
      encoding: "utf8"
    });
    return output.includes(`"${pid}"`);
  } catch {
    return false;
  }
}

function presentEnvKeys() {
  const envPath = join(repoRoot, ".env.local");
  if (!existsSync(envPath)) return { envFile: false, keys: [] };
  const keys = [];
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    if (match[2].trim().length > 0) keys.push(match[1]);
  }
  return { envFile: true, keys };
}

function envReady(keys) {
  const hasUrl = keys.includes("NEXT_PUBLIC_SUPABASE_URL");
  const hasAnon =
    keys.includes("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    keys.includes("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  const hasSession = keys.includes("SESSION_SECRET");
  return { hasUrl, hasAnon, hasSession, ok: hasUrl && hasAnon && hasSession };
}

async function fetchText(url, redirect) {
  const response = await fetch(url, { redirect, headers: { accept: "text/html,application/json" } });
  const body = await response.text();
  return {
    url,
    status: response.status,
    location: response.headers.get("location"),
    contentType: response.headers.get("content-type"),
    body
  };
}

function killPidTree(pid) {
  try {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Already exited.
  }
}

async function launch() {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    fail(`VERIFY_PORT must be an integer port. Got ${process.env.VERIFY_PORT}`);
  }
  const nextBin = join(repoRoot, "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(nextBin)) {
    fail(`Next.js is not installed at ${nextBin}. Run npm install in ${repoRoot}.`);
  }
  const existing = readState();
  if (existing && processAlive(existing.pid)) {
    fail(
      `A verification server is already running as pid ${existing.pid} on port ${existing.port}. Run cleanup before launching another.`
    );
  }
  const listeners = listeningPids(port);
  if (listeners.length > 0) {
    fail(
      `Port ${port} is already listening (pid ${listeners.join(", ")}). Refusing to take over a process this run did not start.`
    );
  }

  mkdirSync(runDir, { recursive: true });
  const logFd = openSync(logPath, "w");
  const child = spawn(process.execPath, [nextBin, "dev", "--port", String(port)], {
    cwd: repoRoot,
    detached: true,
    windowsHide: true,
    stdio: ["ignore", logFd, logFd],
    env: {
      ...process.env,
      NEXT_TELEMETRY_DISABLED: "1",
      NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${port}`
    }
  });
  closeSync(logFd);
  child.unref();

  const startedAt = new Date().toISOString();
  writeFileSync(
    statePath,
    JSON.stringify({ pid: child.pid, port, startedAt, logPath }, null, 2)
  );

  const deadline = Date.now() + readyTimeoutMs;
  let logText = "";
  while (Date.now() < deadline) {
    if (!processAlive(child.pid)) {
      logText = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
      fail(`Next.js exited before it was ready.\n${logText.slice(-2000)}`);
    }
    logText = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
    if (/EADDRINUSE|port is in use/i.test(logText)) {
      killPidTree(child.pid);
      fail(`Next.js reported port ${port} is in use.\n${logText.slice(-1000)}`);
    }
    if (/Local:\s+http:\/\/localhost:(\d+)/.test(logText) && /Ready in /.test(logText)) {
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  logText = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  if (!/Ready in /.test(logText)) {
    killPidTree(child.pid);
    fail(`Timed out after ${readyTimeoutMs}ms waiting for Next.js Ready.\n${logText.slice(-2000)}`);
  }

  const base = `http://127.0.0.1:${port}`;
  let login;
  try {
    login = await fetchText(`${base}/login`, "manual");
  } catch (error) {
    killPidTree(child.pid);
    fail(`Server printed Ready but ${base}/login did not answer: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (login.status !== 200 || !login.body.includes("Sign in") || !login.body.includes("Work email")) {
    killPidTree(child.pid);
    fail(`Server is up but /login is not usable (status ${login.status}).`);
  }

  const listenerPids = listeningPids(port);
  const state = {
    pid: child.pid,
    port,
    baseUrl: base,
    startedAt,
    logPath,
    listenerPids
  };
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  console.log(JSON.stringify({ ok: true, ...state }, null, 2));
}

async function doctor() {
  const state = readState();
  if (!state) fail("No verification state file. Launch first.");
  const alive = processAlive(state.pid);
  const listeners = listeningPids(state.port);
  const ownsPort = listeners.some((pid) => state.listenerPids?.includes(pid) || pid === String(state.pid));
  const env = presentEnvKeys();
  const envStatus = envReady(env.keys);
  const base = state.baseUrl;
  const login = await fetchText(`${base}/login`, "manual");
  const dashboard = await fetchText(`${base}/dashboard`, "manual");
  const api = await fetchText(`${base}/api/big-book/types`, "manual");
  let apiError = null;
  try {
    apiError = JSON.parse(api.body).error ?? null;
  } catch {
    apiError = null;
  }
  let nextVersion = null;
  try {
    nextVersion = JSON.parse(readFileSync(join(repoRoot, "node_modules", "next", "package.json"), "utf8")).version;
  } catch {
    nextVersion = null;
  }
  const appVersion = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")).version;
  const loginUsable = login.status === 200 && login.body.includes("Sign in") && login.body.includes("Work email");
  const dashboardRedirects =
    (dashboard.status === 307 || dashboard.status === 302) &&
    typeof dashboard.location === "string" &&
    dashboard.location.includes("/login");
  const apiUnauthorized = api.status === 401 && apiError === "Unauthorized";
  const report = {
    ok: alive && ownsPort && envStatus.ok && loginUsable && dashboardRedirects && apiUnauthorized,
    pid: state.pid,
    pidAlive: alive,
    port: state.port,
    baseUrl: base,
    listenerPids: listeners,
    portOwnedByThisRun: ownsPort,
    appVersion,
    nextVersion,
    envFile: env.envFile,
    supabaseUrlSet: envStatus.hasUrl,
    supabaseAnonKeySet: envStatus.hasAnon,
    sessionSecretSet: envStatus.hasSession,
    loginStatus: login.status,
    loginUsable,
    dashboardStatus: dashboard.status,
    dashboardLocation: dashboard.location,
    dashboardRedirectsToLogin: dashboardRedirects,
    apiTypesStatus: api.status,
    apiTypesError: apiError,
    apiUnauthorized
  };
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exit(1);
}

function cleanup() {
  const state = readState();
  if (state?.pid) {
    killPidTree(state.pid);
  }
  if (existsSync(runDir)) {
    rmSync(runDir, { recursive: true, force: true });
  }
  console.log(JSON.stringify({ ok: true, removedRunDir: true, evidencePreserved: true }, null, 2));
}

const command = process.argv[2];
if (command === "launch") {
  await launch();
} else if (command === "doctor") {
  await doctor();
} else if (command === "cleanup") {
  cleanup();
} else {
  fail("Usage: verify-ctl.mjs <launch|doctor|cleanup>");
}

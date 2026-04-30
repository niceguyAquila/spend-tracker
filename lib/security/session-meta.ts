import { SESSION_META_COOKIE } from "./cookies";

export const IDLE_MS = 30 * 60 * 1000;
export const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
export const ABSOLUTE_RM_MS = 7 * 24 * 60 * 60 * 1000;

export type SessionMeta = {
  iat: number;
  la: number;
  rm: boolean;
  uid: string;
  sid: string;
};

export type IssueResult = { value: string; meta: SessionMeta; maxAge: number };

export type SessionStatus =
  | { kind: "ok"; meta: SessionMeta }
  | { kind: "missing" }
  | { kind: "invalid" }
  | { kind: "idle-expired" }
  | { kind: "absolute-expired" };

export const SESSION_META_COOKIE_NAME = SESSION_META_COOKIE;

const encoder = new TextEncoder();

let cachedKey: { secret: string; key: CryptoKey } | null = null;

async function getKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required for signed session metadata.");
  }
  const secretBytes = encoder.encode(secret);
  if (secretBytes.byteLength < 32) {
    throw new Error("SESSION_SECRET must be at least 32 bytes of entropy.");
  }
  if (cachedKey && cachedKey.secret === secret) {
    return cachedKey.key;
  }
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  cachedKey = { secret, key };
  return key;
}

function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=+$/u, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlToBytes(value: string): Uint8Array {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.length % 4 === 0 ? base64 : base64 + "=".repeat(4 - (base64.length % 4));
  const binary = atob(padded);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

function utf8ToBase64Url(value: string): string {
  return bytesToBase64Url(encoder.encode(value));
}

function base64UrlToUtf8(value: string): string {
  return new TextDecoder().decode(base64UrlToBytes(value));
}

async function sign(payload: string): Promise<string> {
  const key = await getKey();
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload) as BufferSource);
  return bytesToBase64Url(new Uint8Array(sig));
}

async function verify(payload: string, signature: string): Promise<boolean> {
  let sigBytes: Uint8Array;
  try {
    sigBytes = base64UrlToBytes(signature);
  } catch {
    return false;
  }
  const key = await getKey();
  return crypto.subtle.verify(
    "HMAC",
    key,
    sigBytes as BufferSource,
    encoder.encode(payload) as BufferSource
  );
}

async function encode(meta: SessionMeta): Promise<string> {
  const payload = utf8ToBase64Url(JSON.stringify(meta));
  const signature = await sign(payload);
  return `${payload}.${signature}`;
}

export async function decode(raw: string | undefined | null): Promise<SessionMeta | null> {
  if (!raw) {
    return null;
  }
  const dot = raw.indexOf(".");
  if (dot <= 0) {
    return null;
  }
  const payload = raw.slice(0, dot);
  const signature = raw.slice(dot + 1);
  let valid: boolean;
  try {
    valid = await verify(payload, signature);
  } catch {
    return null;
  }
  if (!valid) {
    return null;
  }
  try {
    const json = base64UrlToUtf8(payload);
    const data = JSON.parse(json) as Partial<SessionMeta>;
    if (
      typeof data.iat === "number" &&
      typeof data.la === "number" &&
      typeof data.rm === "boolean" &&
      typeof data.uid === "string" &&
      typeof data.sid === "string"
    ) {
      return data as SessionMeta;
    }
    return null;
  } catch {
    return null;
  }
}

export async function issue(uid: string, rememberMe: boolean): Promise<IssueResult> {
  const now = Date.now();
  const meta: SessionMeta = {
    iat: now,
    la: now,
    rm: rememberMe,
    uid,
    sid: bytesToBase64Url(randomBytes(16))
  };
  const value = await encode(meta);
  const cap = rememberMe ? ABSOLUTE_RM_MS : ABSOLUTE_MS;
  const maxAge = Math.floor(cap / 1000);
  return { value, meta, maxAge };
}

export async function rolled(meta: SessionMeta): Promise<IssueResult> {
  const now = Date.now();
  const next: SessionMeta = { ...meta, la: now };
  const value = await encode(next);
  const cap = next.rm ? ABSOLUTE_RM_MS : ABSOLUTE_MS;
  const maxAge = Math.max(0, Math.floor((next.iat + cap - now) / 1000));
  return { value, meta: next, maxAge };
}

export async function evaluate(
  rawCookie: string | undefined | null,
  expectedUid: string,
  now: number = Date.now()
): Promise<SessionStatus> {
  if (!rawCookie) {
    return { kind: "missing" };
  }
  const meta = await decode(rawCookie);
  if (!meta) {
    return { kind: "invalid" };
  }
  if (meta.uid !== expectedUid) {
    return { kind: "invalid" };
  }
  if (now - meta.la > IDLE_MS) {
    return { kind: "idle-expired" };
  }
  const cap = meta.rm ? ABSOLUTE_RM_MS : ABSOLUTE_MS;
  if (now - meta.iat > cap) {
    return { kind: "absolute-expired" };
  }
  return { kind: "ok", meta };
}

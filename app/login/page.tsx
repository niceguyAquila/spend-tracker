"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { sanitizeNextPath } from "@/lib/auth/redirect";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  "session-expired": "Your session has expired. Please sign in again.",
  "not-allowed": "Your account is not authorized to access this workspace."
};

function LoginForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const code = searchParams.get("error");
    if (code && LOGIN_ERROR_MESSAGES[code]) {
      setError(LOGIN_ERROR_MESSAGES[code]);
    }
  }, [searchParams]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const nextPath = sanitizeNextPath(searchParams.get("next"));
      const response = await fetch("/auth/sign-in", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          remember: rememberMe,
          next: nextPath
        })
      });
      const payload = (await response.json().catch(() => null)) as { error?: string; redirect?: string } | null;
      if (!response.ok || !payload?.redirect) {
        setError(payload?.error ?? "Unable to start login.");
        return;
      }
      window.location.assign(payload.redirect);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-content-default items-center justify-center px-4 lg:px-8">
      <section className="card w-full max-w-content-narrow">

        <form onSubmit={handleSubmit} className="space-y-3">
          <label className="block text-sm">
            Work email
            <input
              className="field mt-1"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@company.com"
            />
          </label>
          <label className="block text-sm">
            Password
            <input
              className="field mt-1"
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Your password"
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(event) => setRememberMe(event.target.checked)}
            />
            <span>Remember me on this device for 7 days</span>
          </label>
          <button className="btn w-full" disabled={loading} type="submit">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {message ? <p className="mt-3 text-sm text-[rgb(var(--success))]">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-[rgb(var(--danger))]">{error}</p> : null}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-content-default items-center justify-center px-4 lg:px-8">
          <p className="text-sm text-muted">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

"use client";

import { FormEvent, Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/redirect";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  "session-expired": "Your session has expired. Please sign in again.",
  "not-allowed": "Your account is not authorized to access this workspace.",
  "no-brand-access": "Your account is not assigned to any active brand. Contact an administrator."
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
      const supabase = createClient();
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (authError) {
        setError(authError.message);
      } else {
        const nextPath = sanitizeNextPath(searchParams.get("next"));
        const initUrl = new URL("/auth/init-session", window.location.origin);
        initUrl.searchParams.set("next", nextPath);
        if (rememberMe) {
          initUrl.searchParams.set("remember", "1");
        }
        window.location.href = initUrl.toString();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-content-default items-center justify-center px-4 lg:px-8">
      <section className="card w-full max-w-content-narrow">
        <h1 className="mb-1 text-2xl font-semibold">Internal Access</h1>
        <p className="mb-4 text-sm text-slate-600">
          Sign in with your invited company account to access the spend tracker.
        </p>

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
          <label className="flex items-center gap-2 text-sm text-slate-600">
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

        {message ? <p className="mt-3 text-sm text-emerald-600">{message}</p> : null}
        {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
      </section>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex min-h-screen w-full max-w-content-default items-center justify-center px-4 lg:px-8">
          <p className="text-sm text-slate-600">Loading…</p>
        </main>
      }
    >
      <LoginForm />
    </Suspense>
  );
}

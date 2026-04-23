"use client";

import { FormEvent, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { sanitizeNextPath } from "@/lib/auth/redirect";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
        window.location.href = nextPath;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to start login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-6">
      <section className="card w-full">
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

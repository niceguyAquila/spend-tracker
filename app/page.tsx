import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl items-center justify-center px-6">
      <section className="card max-w-xl text-center">
        <h1 className="mb-2 text-2xl font-semibold">Multi-Brand Spend Tracker</h1>
        <p className="mb-5 text-sm text-slate-600">
          Track monthly operational spending with direct entry, dynamic sub-categories, and dashboard insights.
        </p>
        <Link href="/dashboard" className="btn inline-block">
          Open Dashboard
        </Link>
      </section>
    </main>
  );
}

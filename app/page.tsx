import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-content-default items-center justify-center px-4 lg:px-8">
      <section className="card w-full max-w-content-narrow text-center">
        <h1 className="mb-2 text-2xl font-semibold">Accounting</h1>
        <p className="mb-5 text-sm text-muted">
          Transaction Big Book and Credit Big Book for finance operations.
        </p>
        <Link href="/dashboard" className="btn inline-block">
          Open Dashboard
        </Link>
      </section>
    </main>
  );
}

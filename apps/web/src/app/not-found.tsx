import Link from "next/link";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <section className="w-full max-w-lg rounded-card border bg-surface p-8 text-center shadow-card sm:p-12">
        <p className="font-mono text-sm font-semibold text-primary">404</p>
        <h1 className="mt-3 text-2xl font-semibold tracking-[-0.03em]">
          Project not found
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Check the Project ID or return to the first available Project.
        </p>
        <Link
          href="/"
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
        >
          Back to Project list
        </Link>
      </section>
    </main>
  );
}

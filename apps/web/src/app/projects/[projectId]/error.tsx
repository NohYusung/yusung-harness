"use client";

import Link from "next/link";

interface ProjectErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ProjectError({ error, reset }: ProjectErrorProps) {
  return (
    <main className="grid min-h-dvh place-items-center px-5 py-12">
      <section
        role="alert"
        className="w-full max-w-lg rounded-card border border-danger/20 bg-surface p-8 text-center shadow-card sm:p-12"
      >
        <span
          aria-hidden="true"
          className="mx-auto grid size-12 place-items-center rounded-full bg-danger-soft text-lg font-semibold text-danger"
        >
          !
        </span>
        <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">
          Could not load the Project
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Check the server connection and try again.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted">
            Error reference: {error.digest}
          </p>
        ) : null}
        <div className="mt-7 flex flex-col justify-center gap-2 sm:flex-row">
          <button
            type="button"
            onClick={() => reset()}
            className="inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
          >
            Try again
          </button>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center justify-center rounded-control border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
          >
            Back to Project list
          </Link>
        </div>
      </section>
    </main>
  );
}

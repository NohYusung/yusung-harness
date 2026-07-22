"use client";

interface RootErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function RootError({ error, reset }: RootErrorProps) {
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
          Could not load the Project list
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Check the backend server connection and try again.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted">
            Error reference: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
        >
          Try again
        </button>
      </section>
    </main>
  );
}

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
          프로젝트 목록을 불러오지 못했습니다
        </h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          백엔드 서버 연결을 확인한 뒤 다시 시도해 주세요.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-muted">
            오류 참조: {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => reset()}
          className="mt-7 inline-flex min-h-11 items-center justify-center rounded-control bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
        >
          다시 시도
        </button>
      </section>
    </main>
  );
}

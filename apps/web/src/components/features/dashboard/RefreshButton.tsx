"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => router.refresh())}
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-control border bg-surface px-3.5 text-sm font-semibold text-ink shadow-card transition-colors hover:border-primary/30 hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-wait disabled:opacity-60 motion-reduce:transition-none"
    >
      <span aria-hidden="true" className={isPending ? "animate-spin motion-reduce:animate-none" : ""}>
        ↻
      </span>
      {isPending ? "동기화 중" : "새로고침"}
    </button>
  );
}

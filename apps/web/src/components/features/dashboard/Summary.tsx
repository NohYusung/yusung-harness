import { formatDashboardDate } from "@/lib/date";

interface DashboardSummary {
  completedTasks: number;
  lastActivityAt: string | null;
  latestPlanVersion: number | null;
  taskCompletionPercent: number;
  totalArtifacts: number;
  totalTasks: number;
}

interface SummaryProps {
  summary: DashboardSummary;
}

export function Summary({ summary }: SummaryProps) {
  const cards = [
    {
      eyebrow: "Saved records",
      icon: "Σ",
      label: "전체 산출물",
      value: summary.totalArtifacts.toLocaleString("ko-KR"),
    },
    {
      eyebrow: `${summary.taskCompletionPercent}% complete`,
      icon: "✓",
      label: "작업 진행",
      value: `${summary.completedTasks} / ${summary.totalTasks}`,
    },
    {
      eyebrow: "Latest plan",
      icon: "V",
      label: "현재 계획",
      value:
        summary.latestPlanVersion === null
          ? "—"
          : `v${summary.latestPlanVersion}`,
    },
    {
      eyebrow: "Last updated",
      icon: "↻",
      label: "최근 활동",
      value: summary.lastActivityAt
        ? formatDashboardDate(summary.lastActivityAt)
        : "활동 없음",
    },
  ];

  return (
    <section aria-labelledby="summary-heading" className="mt-8">
      <h2 id="summary-heading" className="sr-only">
        프로젝트 요약
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <article
            key={card.label}
            className="rounded-card border bg-surface p-5 shadow-card"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-muted">{card.label}</p>
                <p className="mt-2 text-2xl font-semibold tracking-[-0.035em] text-ink">
                  {card.value}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="grid size-9 shrink-0 place-items-center rounded-control bg-primary-soft font-mono text-xs font-semibold text-primary"
              >
                {card.icon}
              </span>
            </div>
            <p className="mt-4 font-mono text-micro tracking-[0.08em] text-muted uppercase">
              {card.eyebrow}
            </p>
            {index === 1 ? (
              <div className="mt-3">
                <div
                  role="progressbar"
                  aria-label="완료된 작업 비율"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={summary.taskCompletionPercent}
                  aria-valuetext={`${summary.completedTasks}/${summary.totalTasks} 완료`}
                  className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
                >
                  <div
                    className="h-full rounded-full bg-success transition-[width] motion-reduce:transition-none"
                    style={{ width: `${summary.taskCompletionPercent}%` }}
                  />
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}

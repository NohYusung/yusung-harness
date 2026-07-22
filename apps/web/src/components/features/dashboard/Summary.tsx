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
      label: "Total records",
      value: summary.totalArtifacts.toLocaleString("ko-KR"),
    },
    {
      eyebrow: `${summary.taskCompletionPercent}% complete`,
      icon: "✓",
      label: "Task progress",
      value: `${summary.completedTasks} / ${summary.totalTasks}`,
    },
    {
      eyebrow: "Latest plan",
      icon: "V",
      label: "Current Plan",
      value:
        summary.latestPlanVersion === null
          ? "—"
          : `v${summary.latestPlanVersion}`,
    },
    {
      eyebrow: "Last updated",
      icon: "↻",
      label: "Last activity",
      value: summary.lastActivityAt
        ? formatDashboardDate(summary.lastActivityAt)
        : "No activity",
    },
  ];

  return (
    <section aria-labelledby="summary-heading" className="mt-8">
      <h2 id="summary-heading" className="sr-only">
        Project summary
      </h2>
      <div className="grid overflow-hidden rounded-card border bg-surface sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <article
            key={card.label}
            className="border-b border-r p-4 last:border-b-0 sm:p-5 xl:border-b-0"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-subtle">{card.label}</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.025em] text-ink">
                  {card.value}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-control bg-surface-muted font-mono text-micro font-semibold text-muted"
              >
                {card.icon}
              </span>
            </div>
            <p className="mt-4 font-mono text-micro text-subtle">
              {card.eyebrow}
            </p>
            {index === 1 ? (
              <div className="mt-3">
                <div
                  role="progressbar"
                  aria-label="Completed Task ratio"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={summary.taskCompletionPercent}
                  aria-valuetext={`${summary.completedTasks}/${summary.totalTasks} completed`}
                  className="h-1 overflow-hidden rounded-full bg-surface-muted"
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

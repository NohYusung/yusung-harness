import type { ProjectContext } from "@/types/dashboard";

interface PipelineStripProps {
  context: ProjectContext;
}

export function PipelineStrip({ context }: PipelineStripProps) {
  const phases = [
    {
      count: context.drafts.length,
      description: "아이디어를 넓힙니다",
      label: "발견",
      marker: "01",
    },
    {
      count: context.plans.length + context.tasks.length,
      description: "범위와 실행을 잇습니다",
      label: "계획",
      marker: "02",
    },
    {
      count: context.architectures.length,
      description: "시스템 경계를 세웁니다",
      label: "구조",
      marker: "03",
    },
    {
      count:
        context.wireframes.length +
        context.assets.length +
        context.designs.length,
      description: "화면을 구체화합니다",
      label: "형상",
      marker: "04",
    },
    {
      count: context.reviews.length,
      description: "결과를 검증합니다",
      label: "검토",
      marker: "05",
    },
  ];

  return (
    <section
      aria-labelledby="pipeline-heading"
      className="mt-6 rounded-card border bg-surface p-5 shadow-card sm:p-6"
    >
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Workflow map
          </p>
          <h2 id="pipeline-heading" className="mt-2 text-lg font-semibold">
            산출물 파이프라인
          </h2>
        </div>
        <p className="hidden text-xs text-muted sm:block">발견에서 검토까지</p>
      </div>
      <ol className="mt-5 flex snap-x gap-2 overflow-x-auto pb-1 xl:grid xl:grid-cols-5 xl:overflow-visible">
        {phases.map((phase) => (
          <li
            key={phase.label}
            className="min-w-44 snap-start rounded-card border bg-canvas p-4 xl:min-w-0"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-micro font-semibold text-primary">
                {phase.marker}
              </span>
              <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-xs font-semibold text-muted">
                {phase.count}
              </span>
            </div>
            <p className="mt-5 text-sm font-semibold">{phase.label}</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              {phase.description}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

import Link from "next/link";
import type { ProjectContext, ProjectSummary } from "@/types/dashboard";

interface ProjectSidebarProps {
  context: ProjectContext;
  projects: ProjectSummary[];
}

/** 프로젝트 목록 badge에 표시할 전체 artifact record 수를 계산한다. */
function getProjectArtifactCount(project: ProjectSummary): number {
  return Object.values(project._count).reduce(
    (total, count) => total + count,
    0,
  );
}

/** Explorer가 현재 프로젝트에서 표시할 비대화형 artifact inventory 항목. */
interface ProjectInventoryItem {
  code: string;
  count: number;
  label: string;
}

/** 현재 ProjectContext를 Workbench Explorer의 고정된 9종 inventory로 축소한다. */
function getProjectInventory(
  context: ProjectContext,
): ReadonlyArray<ProjectInventoryItem> {
  const completedTasks = context.tasks.filter(
    ({ status }) => status === "COMPLETED",
  ).length;

  return [
    {
      code: "PL",
      count: context.plans.length,
      label: `Plan ${context.plans.length}`,
    },
    {
      code: "TK",
      count: context.tasks.length,
      label: `Task ${context.tasks.length} · ${completedTasks} complete`,
    },
    {
      code: "DR",
      count: context.drafts.length,
      label: `Draft ${context.drafts.length}`,
    },
    {
      code: "DM",
      count: context.domains.length,
      label: `Domain ${context.domains.length}`,
    },
    {
      code: "AR",
      count: context.architectures.length,
      label: `Architecture ${context.architectures.length}`,
    },
    {
      code: "WF",
      count: context.wireframes.length,
      label: `Wireframe ${context.wireframes.length}`,
    },
    {
      code: "AS",
      count: context.assets.length,
      label: `Asset ${context.assets.length}`,
    },
    {
      code: "DS",
      count: context.designs.length,
      label: `Design ${context.designs.length}`,
    },
    {
      code: "RV",
      count: context.reviews.length,
      label: `Review ${context.reviews.length}`,
    },
  ];
}

/** 프로젝트 전환과 현재 프로젝트의 artifact inventory를 제공한다. */
export function ProjectSidebar({
  context,
  projects,
}: ProjectSidebarProps) {
  const inventory = getProjectInventory(context);
  const recordCount = inventory.reduce(
    (total, item) => total + item.count,
    0,
  );

  return (
    <aside
      aria-label="Project explorer"
      className="sticky top-0 hidden h-dvh min-h-0 flex-col border-r bg-sidebar lg:flex"
    >
      <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
        <Link
          href="/"
          className="flex min-h-11 min-w-0 items-center gap-3 rounded-control focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          aria-label="Yusung Harness home"
        >
          <span
            aria-hidden="true"
            className="grid size-8 shrink-0 place-items-center rounded-control border bg-surface font-mono text-micro font-semibold text-ink"
          >
            YH
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-semibold tracking-[-0.02em]">
              Artifact Workbench
            </span>
            <span className="block truncate text-micro text-subtle">
              {context.title} · {context.repoType}
            </span>
          </span>
        </Link>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
          <h2 className="text-xs font-semibold tracking-[0.1em] text-muted uppercase">
            Explorer
          </h2>
          <span className="font-mono text-micro text-subtle">
            {inventory.length} types
          </span>
        </div>

        <nav aria-label="Project list" className="px-3 py-4">
          <div className="flex items-center justify-between gap-3 px-2">
            <p className="text-micro font-semibold tracking-[0.12em] text-subtle uppercase">
              Projects
            </p>
            <span className="font-mono text-micro text-subtle">
              {projects.length}
            </span>
          </div>
          <ul className="mt-2 space-y-0.5">
            {projects.map((project) => {
              const isActive = project.id === context.id;

              return (
                <li key={project.id}>
                  <Link
                    href={`/projects/${project.id}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`group flex min-h-11 items-center gap-2.5 rounded-control px-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none ${
                      isActive
                        ? "bg-selected text-ink"
                        : "text-muted hover:bg-hover hover:text-ink"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`grid size-6 shrink-0 place-items-center rounded font-mono text-[0.625rem] font-semibold ${
                        isActive
                          ? "bg-primary-soft text-primary"
                          : "bg-surface-muted text-subtle group-hover:text-muted"
                      }`}
                    >
                      {project.title
                        .trim()
                        .charAt(0)
                        .toLocaleUpperCase("en-US")}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {project.title}
                    </span>
                    <span className="font-mono text-micro text-subtle">
                      {getProjectArtifactCount(project)}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section
          aria-labelledby="project-records-heading"
          className="border-t px-3 py-4"
        >
          <div className="flex items-center justify-between gap-3 px-2">
            <h3
              id="project-records-heading"
              className="text-micro font-semibold tracking-[0.12em] text-subtle uppercase"
            >
              Project records
            </h3>
            <span className="font-mono text-micro text-subtle">
              {recordCount}
            </span>
          </div>
          <ul className="mt-2 space-y-0.5" aria-label="Project record inventory">
            {inventory.map((item) => (
              <li
                key={item.code}
                className="flex min-h-9 items-center gap-2.5 rounded-control px-2 text-xs text-muted"
              >
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center rounded bg-surface-muted font-mono text-[0.625rem] font-semibold text-subtle"
                >
                  {item.code}
                </span>
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="shrink-0 border-t px-4 py-3">
        <p
          className="truncate font-mono text-micro text-subtle"
          title={context.repoPath}
        >
          {context.repoPath}
        </p>
      </div>
    </aside>
  );
}

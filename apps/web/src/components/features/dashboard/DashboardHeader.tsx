import type { ProjectContext, ProjectSummary } from "@/types/dashboard";
import { ProjectSwitcher } from "./ProjectSwitcher";
import { RefreshButton } from "./RefreshButton";

interface DashboardHeaderProps {
  context: ProjectContext;
  projects: ProjectSummary[];
}

export function DashboardHeader({
  context,
  projects,
}: DashboardHeaderProps) {
  return (
    <header>
      <div className="mb-7 lg:hidden">
        <ProjectSwitcher
          id="mobile-project-switcher"
          currentProjectId={context.id}
          projects={projects}
        />
      </div>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
              Project Workbench
            </p>
            <span className="rounded-full border bg-surface px-2 py-0.5 font-mono text-micro font-semibold text-muted">
              {context.repoType}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-balance sm:text-4xl">
            {context.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-muted sm:text-base">
            {context.description}
          </p>
          <p className="mt-3 max-w-full truncate font-mono text-xs text-muted" title={context.repoPath}>
            {context.repoPath}
          </p>
        </div>
        <RefreshButton />
      </div>
    </header>
  );
}

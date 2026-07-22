import type { ProjectContext, ProjectSummary } from "@/types/dashboard";
import { ProjectSwitcher } from "./ProjectSwitcher";

/** 대시보드 헤더가 표시할 현재 프로젝트 정보와 전환 대상 목록. */
interface DashboardHeaderProps {
  context: ProjectContext;
  projects: ProjectSummary[];
}

/** 현재 프로젝트의 식별 정보와 모바일 프로젝트 전환기를 표시한다. */
export function DashboardHeader({
  context,
  projects,
}: DashboardHeaderProps) {
  return (
    <header className="shrink-0 border-b bg-canvas px-4 py-3 sm:px-6 lg:min-h-14 lg:px-5 lg:py-0">
      <div className="mb-3 rounded-card border bg-sidebar p-3 lg:hidden">
        <ProjectSwitcher
          id="mobile-project-switcher"
          currentProjectId={context.id}
          projects={projects}
        />
      </div>
      <div className="flex min-h-11 min-w-0 items-center gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-micro font-semibold tracking-[0.12em] text-subtle uppercase">
            Artifact Workbench
          </p>
          <h1 className="truncate text-sm font-semibold tracking-[-0.02em] text-ink">
            {context.title}
          </h1>
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-subtle">
          <span
            aria-hidden="true"
            className="size-1.5 shrink-0 rounded-full bg-success"
          />
          <span className="shrink-0 rounded-control border bg-surface px-2 py-1 font-mono text-micro font-semibold text-muted">
            {context.repoType}
          </span>
          <p
            className="hidden max-w-80 truncate font-mono xl:block"
            title={context.repoPath}
          >
            {context.repoPath}
          </p>
        </div>
      </div>
    </header>
  );
}

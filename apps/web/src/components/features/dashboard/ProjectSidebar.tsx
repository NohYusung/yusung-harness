import Link from "next/link";
import type { ProjectContext, ProjectSummary } from "@/types/dashboard";
import type { ArtifactRelation } from "./ArtifactBrowser";
import { ProjectSwitcher } from "./ProjectSwitcher";

interface ProjectSidebarProps {
  activeRelation: ArtifactRelation | null;
  context: ProjectContext;
  projects: ProjectSummary[];
}

const navigation = [
  { code: "PL", label: "계획", relation: "plans" },
  { code: "TK", label: "작업", relation: "tasks" },
  { code: "DR", label: "초안", relation: "drafts" },
  { code: "AR", label: "아키텍처", relation: "architectures" },
  { code: "WF", label: "와이어프레임", relation: "wireframes" },
  { code: "AS", label: "에셋", relation: "assets" },
  { code: "DS", label: "디자인", relation: "designs" },
  { code: "RV", label: "리뷰", relation: "reviews" },
] as const satisfies ReadonlyArray<{
  code: string;
  label: string;
  relation: ArtifactRelation;
}>;

export function ProjectSidebar({
  activeRelation,
  context,
  projects,
}: ProjectSidebarProps) {
  return (
    <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-surface px-4 py-5 lg:flex">
      <Link
        href="/"
        className="flex min-h-11 items-center gap-3 rounded-control px-2 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
        aria-label="Yusung Harness 홈"
      >
        <span
          aria-hidden="true"
          className="grid size-9 place-items-center rounded-control bg-ink font-mono text-xs font-semibold text-white"
        >
          YH
        </span>
        <span>
          <span className="block text-sm font-semibold tracking-[-0.02em]">
            Yusung Harness
          </span>
          <span className="block text-micro text-muted">Artifact console</span>
        </span>
      </Link>

      <div className="mt-7 px-2">
        <ProjectSwitcher
          id="desktop-project-switcher"
          currentProjectId={context.id}
          projects={projects}
        />
      </div>

      <nav aria-label="프로젝트 산출물" className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <p className="px-3 text-micro font-semibold tracking-[0.12em] text-muted uppercase">
          Workspace
        </p>
        <ul className="mt-2 space-y-1">
          <li>
            <Link
              href={`/projects/${context.id}`}
              aria-current={activeRelation === null ? "page" : undefined}
              className={`flex min-h-11 items-center justify-between rounded-control px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none motion-reduce:transition-none ${
                activeRelation === null
                  ? "bg-primary-soft text-primary"
                  : "text-muted hover:bg-surface-muted hover:text-ink"
              }`}
            >
              <span className="flex items-center gap-3">
                <span className="grid size-6 place-items-center rounded bg-surface-muted font-mono text-[0.625rem] font-semibold">
                  OV
                </span>
                개요
              </span>
            </Link>
          </li>
          {navigation.map((item) => {
            const isActive = activeRelation === item.relation;
            return (
              <li key={item.relation}>
                <Link
                  href={`/projects/${context.id}?type=${item.relation}`}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex min-h-11 items-center justify-between rounded-control px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none motion-reduce:transition-none ${
                    isActive
                      ? "bg-primary-soft text-primary"
                      : "text-muted hover:bg-surface-muted hover:text-ink"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid size-6 shrink-0 place-items-center rounded bg-surface-muted font-mono text-[0.625rem] font-semibold">
                      {item.code}
                    </span>
                    <span className="truncate">{item.label}</span>
                  </span>
                  <span className="ml-2 font-mono text-micro text-muted">
                    {context[item.relation].length}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5 border-t px-2 pt-5">
        <div className="flex items-center gap-2">
          <span className="size-2 rounded-full bg-success" aria-hidden="true" />
          <span className="text-xs font-medium text-muted">SQLite connected</span>
        </div>
        <p className="mt-2 truncate font-mono text-micro text-muted" title={context.repoPath}>
          {context.repoPath}
        </p>
      </div>
    </aside>
  );
}

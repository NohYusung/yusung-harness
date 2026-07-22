import type { ProjectContext, ProjectSummary } from "@/types/dashboard";
import {
  ArtifactBrowser,
  type WorkspaceRelation,
} from "./ArtifactBrowser";
import { ArchitectureWorkspace } from "./ArchitectureWorkspace";
import { DashboardHeader } from "./DashboardHeader";
import { DomainWorkspace } from "./DomainWorkspace";
import { ProjectSidebar } from "./ProjectSidebar";
import { ProjectWorkspaceNav } from "./ProjectWorkspaceNav";

/** 프로젝트 shell과 URL 기반 workspace 선택을 조립하는 dashboard props. */
interface DashboardProps {
  activeRelation: WorkspaceRelation;
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

/** relation별 ArtifactBrowser를 remount해 HTML preview state의 수명을 현재 tab으로 제한한다. */
export function Dashboard({
  activeRelation,
  context,
  projects,
  selectedArtifactId,
  selectedTaskId,
}: DashboardProps) {
  return (
    <div className="min-h-dvh bg-canvas lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <ProjectSidebar context={context} projects={projects} />
      <main
        id="main-content"
        className="min-w-0 lg:h-dvh lg:overflow-hidden"
      >
        <div className="flex min-h-dvh w-full flex-col lg:h-full">
          <DashboardHeader context={context} projects={projects} />
          <ProjectWorkspaceNav
            activeRelation={activeRelation}
            context={context}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            {activeRelation === "domains" ? (
              <DomainWorkspace domains={context.domains} />
            ) : activeRelation === "architectures" ? (
              <ArchitectureWorkspace architectures={context.architectures} />
            ) : (
              <ArtifactBrowser
                key={activeRelation}
                activeRelation={activeRelation}
                context={context}
                selectedArtifactId={selectedArtifactId}
                selectedTaskId={selectedTaskId}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

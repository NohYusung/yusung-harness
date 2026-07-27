import type { ProjectContext, ProjectSummary } from "@/types/dashboard";
import { ArtifactWorkbench } from "./ArtifactWorkbench";
import type { WorkspaceRelation } from "./ArtifactBrowser";

/** 프로젝트 shell과 URL 기반 workspace 선택을 조립하는 dashboard props. */
interface DashboardProps {
  activeRelation: WorkspaceRelation;
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

/** 프로젝트의 모든 record를 시안과 동일한 통합 Artifact Workbench로 조립한다. */
export function Dashboard({
  activeRelation,
  context,
  projects,
  selectedArtifactId,
  selectedTaskId,
}: DashboardProps) {
  return (
    <ArtifactWorkbench
      key={context.id}
      activeRelation={activeRelation}
      context={context}
      projects={projects}
      selectedArtifactId={selectedArtifactId}
      selectedTaskId={selectedTaskId}
    />
  );
}

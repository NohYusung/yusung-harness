import type {
  ProjectContext,
  ProjectSummary,
  WorkspaceRelation,
} from "@/types/dashboard";
import {
  ArtifactWorkbench,
  type ArchitectureView,
} from "./ArtifactWorkbench";

/** 프로젝트 shell과 URL 기반 workspace 선택을 조립하는 dashboard props. */
interface DashboardProps {
  activeRelation: WorkspaceRelation;
  architectureView?: ArchitectureView | null;
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

/** 프로젝트의 모든 record를 시안과 동일한 통합 Artifact Workbench로 조립한다. */
export function Dashboard({
  activeRelation,
  architectureView = null,
  context,
  projects,
  selectedArtifactId,
  selectedTaskId,
}: DashboardProps) {
  return (
    <ArtifactWorkbench
      key={context.id}
      activeRelation={activeRelation}
      architectureView={architectureView}
      context={context}
      projects={projects}
      selectedArtifactId={selectedArtifactId}
      selectedTaskId={selectedTaskId}
    />
  );
}

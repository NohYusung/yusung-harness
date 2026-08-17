import type { ProjectContext } from "@/types/dashboard";
import type { WorkspaceRelation } from "./ArtifactBrowser";
import {
  ProjectWorkspaceNavScroller,
  type ProjectWorkspaceNavItem,
} from "./ProjectWorkspaceNavScroller";

/** 상단 workspace 메뉴가 필요로 하는 활성 relation과 프로젝트 컨텍스트. */
interface ProjectWorkspaceNavProps {
  activeRelation: WorkspaceRelation;
  context: ProjectContext;
}

/** 프로젝트 컨텍스트를 직렬화 가능한 메뉴 항목으로 축소해 client leaf에 전달한다. */
export function ProjectWorkspaceNav({
  activeRelation,
  context,
}: ProjectWorkspaceNavProps) {
  /** PLAN/PRODUCTION 물리 row를 Architecture workspace 하나로 집계한다. */
  const architectureCount = context.architectures.length > 0 ? 1 : 0;
  /** 고정된 메뉴 순서와 primitive count만 RSC 경계를 통과한다. */
  const items = [
    { count: context.plans.length, label: "Plan", relation: "plans" },
    { count: context.drafts.length, label: "Draft", relation: "drafts" },
    { count: context.domains.length, label: "Domain", relation: "domains" },
    {
      count: architectureCount,
      label: "Architecture",
      relation: "architectures",
    },
    {
      count: context.wireframes.length,
      label: "Wireframe",
      relation: "wireframes",
    },
    { count: context.assets.length, label: "Asset", relation: "assets" },
    { count: context.designs.length, label: "Design", relation: "designs" },
    { count: context.requests.length, label: "Request", relation: "requests" },
  ] as const satisfies ReadonlyArray<ProjectWorkspaceNavItem>;

  return (
    <ProjectWorkspaceNavScroller
      activeRelation={activeRelation}
      items={items}
      projectId={context.id}
    />
  );
}

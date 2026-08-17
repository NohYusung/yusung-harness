import { notFound } from "next/navigation";
import { Dashboard } from "@/components/features/dashboard/Dashboard";
import { getProjectDashboard, HarnessApiError } from "@/lib/api";
import type { WorkspaceRelation } from "@/components/features/dashboard/ArtifactBrowser";

export const dynamic = "force-dynamic";

/** project route의 type query가 허용하는 상단 workspace relation 목록. */
const workspaceRelations = [
  "plans",
  "drafts",
  "domains",
  "architectures",
  "wireframes",
  "assets",
  "designs",
  "requests",
  "workLogs",
  "databases",
  "erds",
] as const;

/** Architecture workspace 내부에서 선택할 설계·현행 view 목록. */
const architectureViews = ["plan", "current"] as const;

/** URL의 Architecture view query를 제한하는 union. */
type ArchitectureView = (typeof architectureViews)[number];

/** project route params와 선택된 workspace query. */
interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{
    id?: string;
    taskId?: string;
    type?: string;
    view?: string;
  }>;
}

/** 임의의 type query를 지원하는 workspace relation으로 좁힌다. */
function isWorkspaceRelation(value: string | undefined): value is WorkspaceRelation {
  return workspaceRelations.some((relation) => relation === value);
}

/** 임의의 view query를 Architecture 내부 view로 좁힌다. */
function isArchitectureView(
  value: string | undefined,
): value is ArchitectureView {
  return architectureViews.some((view) => view === value);
}

/** 양의 정수 query만 artifact/task ID로 허용한다. */
function toArtifactId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

/** 프로젝트 데이터와 workspace query를 조합해 dashboard를 렌더링한다. */
export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const [{ projectId: projectIdParam }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const projectId = Number(projectIdParam);

  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    notFound();
  }

  /** legacy relation을 포함한 알 수 없는 type은 다른 workspace로 조용히 이동시키지 않는다. */
  if (query.type && !isWorkspaceRelation(query.type)) {
    notFound();
  }

  const activeRelation = isWorkspaceRelation(query.type)
    ? query.type
    : "plans";
  /** Architecture 외부의 view 또는 알 수 없는 Architecture view는 명시적인 404로 처리한다. */
  if (
    query.view &&
    (activeRelation !== "architectures" || !isArchitectureView(query.view))
  ) {
    notFound();
  }
  const architectureView =
    activeRelation === "architectures" && isArchitectureView(query.view)
      ? query.view
      : null;
  const selectedArtifactId = toArtifactId(query.id);
  /** id 미지정만 목록 상태로 허용하고 잘못된 명시값은 stale 선택으로 취급하지 않는다. */
  if (query.id !== undefined && selectedArtifactId === null) {
    notFound();
  }
  const selectedPlanId =
    activeRelation === "plans" ? selectedArtifactId : null;

  const { projects, context } = await getProjectDashboard(
    projectId,
    selectedPlanId,
  ).catch((error: unknown) => {
    if (error instanceof HarnessApiError && error.status === 404) {
      notFound();
    }

    throw error;
  });

  return (
    <Dashboard
      projects={projects}
      context={context}
      activeRelation={activeRelation}
      architectureView={architectureView}
      selectedArtifactId={selectedArtifactId}
      selectedTaskId={toArtifactId(query.taskId)}
    />
  );
}

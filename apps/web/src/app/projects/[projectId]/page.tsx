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
] as const;

/** project route params와 선택된 workspace query. */
interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ id?: string; taskId?: string; type?: string }>;
}

/** 임의의 type query를 지원하는 workspace relation으로 좁힌다. */
function isWorkspaceRelation(value: string | undefined): value is WorkspaceRelation {
  return workspaceRelations.some((relation) => relation === value);
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

  const activeRelation = isWorkspaceRelation(query.type)
    ? query.type
    : "plans";
  const selectedArtifactId = toArtifactId(query.id);
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
      selectedArtifactId={selectedArtifactId}
      selectedTaskId={toArtifactId(query.taskId)}
    />
  );
}

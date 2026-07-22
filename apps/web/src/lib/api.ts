import "server-only";

import type { ZodType } from "zod";
import {
  architectureListResponseSchema,
  assetListResponseSchema,
  designListResponseSchema,
  domainListResponseSchema,
  draftListResponseSchema,
  planListResponseSchema,
  projectListResponseSchema,
  reviewListResponseSchema,
  taskListResponseSchema,
  wireframeListResponseSchema,
} from "@/lib/validations/dashboard";
import type {
  Architecture,
  Asset,
  Design,
  Domain,
  Draft,
  ListResponse,
  Plan,
  ProjectDashboard,
  ProjectSummary,
  Review,
  Task,
  Wireframe,
} from "@/types/dashboard";

/** 서버 전용 Harness REST API base URL. */
const apiUrl = (process.env.HARNESS_API_URL ?? "http://127.0.0.1:4000").replace(
  /\/$/,
  "",
);

/** Harness REST API가 반환한 HTTP 오류. */
export class HarnessApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HarnessApiError";
  }
}

/** 실패한 Harness REST 응답을 도메인 오류로 변환한다. */
async function assertSuccessful(
  response: Response,
  resource: string,
): Promise<void> {
  if (response.ok) return;

  const detail = await response.text();
  const suffix = detail ? `: ${detail}` : "";
  throw new HarnessApiError(
    `Failed to load ${resource} (${response.status} ${response.statusText})${suffix}`,
    response.status,
  );
}

/** 네트워크 요청 전에 양의 정수 project ID 계약을 검증한다. */
function assertProjectId(projectId: number): void {
  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    throw new Error(`Invalid project ID: ${projectId}`);
  }
}

/** resource별 프로젝트 REST 목록을 조회하고 `{ data }` 응답을 검증한다. */
async function getProjectResource<T>(
  projectId: number,
  resource: string,
  schema: ZodType<ListResponse<T>>,
  searchParams?: string,
): Promise<T[]> {
  assertProjectId(projectId);
  const query = searchParams ? `?${searchParams}` : "";
  const response = await fetch(`${apiUrl}/${resource}/${projectId}${query}`, {
    cache: "no-store",
  });

  await assertSuccessful(response, `${resource} for project ${projectId}`);
  const payload = schema.parse(await response.json());
  return payload.data;
}

/** 프로젝트 REST 목록 API를 통해 대시보드 프로젝트 목록을 조회한다. */
export async function getProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${apiUrl}/projects`, {
    cache: "no-store",
  });

  await assertSuccessful(response, "projects");
  const payload = projectListResponseSchema.parse(await response.json());
  return payload.data;
}

/** 프로젝트의 Plan 목록을 조회한다. */
export function getPlans(projectId: number): Promise<Plan[]> {
  return getProjectResource(
    projectId,
    "plans",
    planListResponseSchema,
    "versionOrder=desc",
  );
}

/** 프로젝트의 Task 목록을 조회한다. */
export function getTasks(projectId: number): Promise<Task[]> {
  return getProjectResource(projectId, "tasks", taskListResponseSchema);
}

/** 프로젝트의 Draft 목록을 조회한다. */
export function getDrafts(projectId: number): Promise<Draft[]> {
  return getProjectResource(projectId, "drafts", draftListResponseSchema);
}

/** 프로젝트의 Domain ERD 목록을 조회한다. */
export function getDomains(projectId: number): Promise<Domain[]> {
  return getProjectResource(projectId, "domains", domainListResponseSchema);
}

/** 프로젝트의 배포 Architecture 목록을 조회한다. */
export function getArchitectures(projectId: number): Promise<Architecture[]> {
  return getProjectResource(
    projectId,
    "architectures",
    architectureListResponseSchema,
  );
}

/** 프로젝트의 Wireframe 목록을 조회한다. */
export function getWireframes(projectId: number): Promise<Wireframe[]> {
  return getProjectResource(
    projectId,
    "wireframes",
    wireframeListResponseSchema,
  );
}

/** 프로젝트의 Asset 목록을 조회한다. */
export function getAssets(projectId: number): Promise<Asset[]> {
  return getProjectResource(projectId, "assets", assetListResponseSchema);
}

/** 프로젝트의 Design 목록을 조회한다. */
export function getDesigns(projectId: number): Promise<Design[]> {
  return getProjectResource(projectId, "designs", designListResponseSchema);
}

/** 프로젝트의 Review 목록을 조회한다. */
export function getReviews(projectId: number): Promise<Review[]> {
  return getProjectResource(projectId, "reviews", reviewListResponseSchema);
}

/** 프로젝트 목록과 선택 프로젝트의 9종 REST 목록을 병렬 조립한다. */
export async function getProjectDashboard(
  projectId: number,
): Promise<ProjectDashboard> {
  assertProjectId(projectId);

  /** 서로 독립적인 REST 목록 요청을 하나의 병렬 경계에서 실행한다. */
  const [
    projects,
    plans,
    tasks,
    drafts,
    domains,
    architectures,
    wireframes,
    assets,
    designs,
    reviews,
  ] = await Promise.all([
    getProjects(),
    getPlans(projectId),
    getTasks(projectId),
    getDrafts(projectId),
    getDomains(projectId),
    getArchitectures(projectId),
    getWireframes(projectId),
    getAssets(projectId),
    getDesigns(projectId),
    getReviews(projectId),
  ]);

  /** ProjectSummary에서 선택한 프로젝트의 context 기본 필드만 가져온다. */
  const project = projects.find(({ id }) => id === projectId);
  if (!project) {
    throw new HarnessApiError(`Project ${projectId} not found`, 404);
  }

  /** `_count`를 제외한 기본 필드와 9종 목록으로 context를 완성한다. */
  return {
    projects,
    context: {
      id: project.id,
      title: project.title,
      repoPath: project.repoPath,
      repoType: project.repoType,
      description: project.description,
      plans,
      tasks,
      drafts,
      domains,
      architectures,
      wireframes,
      assets,
      designs,
      reviews,
    },
  };
}

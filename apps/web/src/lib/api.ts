import "server-only";

import type { ZodType } from "zod";
import {
  architectureListResponseSchema,
  assetListResponseSchema,
  databaseListResponseSchema,
  domainListResponseSchema,
  erdListResponseSchema,
  planListResponseSchema,
  projectListResponseSchema,
  createRequestInputSchema,
  requestListResponseSchema,
  requestResponseSchema,
  researchListResponseSchema,
  reviewListResponseSchema,
  taskListResponseSchema,
  updateRequestInputSchema,
  wireframeListResponseSchema,
  workLogListResponseSchema,
} from "@/lib/validations/dashboard";
import type {
  Architecture,
  Asset,
  CreateRequestInput,
  Database,
  Domain,
  Erd,
  ListResponse,
  Plan,
  ProjectDashboard,
  ProjectSummary,
  Research,
  Request,
  Review,
  Task,
  UpdateRequestInput,
  Wireframe,
  WorkLog,
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
  childId?: number,
): Promise<T[]> {
  assertProjectId(projectId);
  const childPath = childId === undefined ? "" : `/${childId}`;
  const query = searchParams ? `?${searchParams}` : "";
  const response = await fetch(
    `${apiUrl}/${resource}/${projectId}${childPath}${query}`,
    {
      cache: "no-store",
    },
  );

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
  return getProjectResource(projectId, "plans", planListResponseSchema);
}

/** 프로젝트에서 선택한 Plan의 Task 목록을 조회한다. */
export function getTasks(projectId: number, planId: number): Promise<Task[]> {
  if (!Number.isSafeInteger(planId) || planId <= 0) {
    throw new Error(`Invalid plan ID: ${planId}`);
  }

  return getProjectResource(
    projectId,
    "tasks",
    taskListResponseSchema,
    undefined,
    planId,
  );
}

/** 프로젝트의 Research Markdown 목록을 조회한다. */
export function getResearch(projectId: number): Promise<Research[]> {
  return getProjectResource(projectId, "research", researchListResponseSchema);
}

/** 프로젝트의 계층형 비즈니스 Domain Markdown 페이지를 조회한다. */
export function getDomains(projectId: number): Promise<Domain[]> {
  return getProjectResource(projectId, "domains", domainListResponseSchema);
}

/** 프로젝트의 PLAN과 PRODUCTION Architecture 목록을 한 번에 조회한다. */
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

/** 프로젝트의 Review 목록을 조회한다. */
export function getReviews(projectId: number): Promise<Review[]> {
  return getProjectResource(projectId, "reviews", reviewListResponseSchema);
}

/** 프로젝트의 Request 목록을 조회한다. */
export function getRequests(projectId: number): Promise<Request[]> {
  return getProjectResource(projectId, "requests", requestListResponseSchema);
}

/** 프로젝트의 WorkLog 목록을 조회한다. */
export function getWorkLogs(projectId: number): Promise<WorkLog[]> {
  return getProjectResource(projectId, "worklogs", workLogListResponseSchema);
}

/** 프로젝트의 DB schema 문서 목록을 조회한다. */
export function getDatabases(projectId: number): Promise<Database[]> {
  return getProjectResource(projectId, "db", databaseListResponseSchema);
}

/** 프로젝트의 ERD HTML 문서 목록을 조회한다. */
export function getErds(projectId: number): Promise<Erd[]> {
  return getProjectResource(projectId, "erd", erdListResponseSchema);
}

/** 새 Request 문서를 project-scoped REST API에 생성한다. */
export async function createRequest(
  projectId: number,
  input: CreateRequestInput,
): Promise<Request> {
  assertProjectId(projectId);
  const body = createRequestInputSchema.parse(input);
  const response = await fetch(`${apiUrl}/requests/${projectId}`, {
    body: JSON.stringify(body),
    cache: "no-store",
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  await assertSuccessful(response, `requests for project ${projectId}`);
  return requestResponseSchema.parse(await response.json()).data;
}

/** 기존 Request 문서와 lifecycle 상태를 project-scoped REST API에서 수정한다. */
export async function updateRequest(
  projectId: number,
  requestId: number,
  input: UpdateRequestInput,
): Promise<Request> {
  assertProjectId(projectId);
  if (!Number.isSafeInteger(requestId) || requestId <= 0) {
    throw new Error(`Invalid request ID: ${requestId}`);
  }

  const body = updateRequestInputSchema.parse(input);
  const response = await fetch(
    `${apiUrl}/requests/${projectId}/${requestId}`,
    {
      body: JSON.stringify(body),
      cache: "no-store",
      headers: { "content-type": "application/json" },
      method: "PUT",
    },
  );

  await assertSuccessful(
    response,
    `request ${requestId} for project ${projectId}`,
  );
  return requestResponseSchema.parse(await response.json()).data;
}

/** 프로젝트 목록과 선택 프로젝트의 REST 목록을 병렬 조립한다. */
export async function getProjectDashboard(
  projectId: number,
  selectedPlanId?: number | null,
): Promise<ProjectDashboard> {
  assertProjectId(projectId);

  /** 서로 독립적인 REST 목록 요청을 하나의 병렬 경계에서 실행한다. */
  const [
    projects,
    plans,
    selectedPlanTasks,
    research,
    domains,
    architectures,
    wireframes,
    assets,
    reviews,
    requests,
    workLogs,
    databases,
    erds,
  ] = await Promise.all([
    getProjects(),
    getPlans(projectId),
    selectedPlanId
      ? getTasks(projectId, selectedPlanId)
      : Promise.resolve(null),
    getResearch(projectId),
    getDomains(projectId),
    getArchitectures(projectId),
    getWireframes(projectId),
    getAssets(projectId),
    getReviews(projectId),
    getRequests(projectId),
    getWorkLogs(projectId),
    getDatabases(projectId),
    getErds(projectId),
  ]);

  /** ProjectSummary에서 선택한 프로젝트의 context 기본 필드만 가져온다. */
  const project = projects.find(({ id }) => id === projectId);
  if (!project) {
    throw new HarnessApiError(`Project ${projectId} not found`, 404);
  }

  /** Plan 선택 전에는 Plan 응답에 포함된 Task를 프로젝트 목록으로 사용한다. */
  const tasks = selectedPlanTasks ?? plans.flatMap((plan) => plan.tasks);

  /** `_count`를 제외한 기본 필드와 산출물 목록으로 context를 완성한다. */
  return {
    projects,
    context: {
      id: project.id,
      title: project.title,
      repoPaths: project.repoPaths,
      description: project.description,
      plans,
      tasks,
      research,
      domains,
      architectures,
      wireframes,
      assets,
      reviews,
      requests,
      workLogs,
      databases,
      erds,
    },
  };
}

import { z } from "zod";
import type {
  Architecture,
  ArchitecturePlan,
  ArtifactDocument,
  ArtifactRecord,
  Asset,
  CreateRequestInput,
  Database,
  Domain,
  Draft,
  Erd,
  ListResponse,
  Plan,
  ProjectContext,
  ProjectSummary,
  Request,
  Review,
  Task,
  UpdateRequestInput,
  Wireframe,
  WorkLog,
} from "@/types/dashboard";

const repoTypeSchema = z.enum(["LOCAL", "REMOTE"]);
const projectRepositorySchema = z.object({
  path: z.string().min(1),
  repoType: repoTypeSchema,
});
const taskStatusSchema = z.enum(["PENDING", "COMPLETED"]);
const planStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]);
const requestStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]);
const dateTimeSchema = z.iso.datetime();

const projectBaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  repoPaths: z.array(projectRepositorySchema).min(1),
  description: z.string(),
});

const artifactCountsSchema = z.object({
  plans: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  domains: z.number().int().nonnegative(),
  architectures: z.number().int().nonnegative(),
  wireframes: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
  requests: z.number().int().nonnegative(),
  workLogs: z.number().int().nonnegative(),
  architecturePlans: z.number().int().nonnegative(),
  databases: z.number().int().nonnegative(),
  erds: z.number().int().nonnegative(),
});

const artifactRecordSchema = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  title: z.string(),
}) satisfies z.ZodType<ArtifactRecord>;

const artifactDocumentSchema = artifactRecordSchema.extend({
  content: z.string(),
}) satisfies z.ZodType<ArtifactDocument>;

/** Domain 페이지는 같은 프로젝트의 다른 Domain을 부모로 참조할 수 있다. */
const domainSchema: z.ZodType<Domain> = artifactDocumentSchema.extend({
  parentId: z.number().int().positive().nullable(),
});

const htmlDocumentSchema = z.string().refine(
  (html) =>
    /<!doctype\s+html(?:\s[^>]*)?>/i.test(html) &&
    /<html(?:\s[^>]*)?>[\s\S]*<\/html\s*>/i.test(html) &&
    /<head(?:\s[^>]*)?>[\s\S]*<\/head\s*>/i.test(html) &&
    /<body(?:\s[^>]*)?>[\s\S]*<\/body\s*>/i.test(html),
  "Expected a complete HTML document",
);

const htmlArtifactSchema = artifactRecordSchema.extend({
  html: htmlDocumentSchema,
});

const wireframeSchema: z.ZodType<Wireframe> = htmlArtifactSchema.extend({
  parentId: z.number().int().positive().nullable(),
  index: z
    .string()
    .trim()
    .max(255)
    .regex(/^[1-9]\d*(?:\.[1-9]\d*)*$/),
  version: z.number().int().positive(),
});
const assetSchema: z.ZodType<Asset> = htmlArtifactSchema;

const reviewSchema: z.ZodType<Review> = artifactDocumentSchema;

/** WorkLog와 DB는 공통 Markdown artifact document shape를 사용한다. */
const workLogSchema: z.ZodType<WorkLog> = artifactDocumentSchema;
const databaseSchema: z.ZodType<Database> = artifactDocumentSchema;

/** Architecture Plan은 HTML 원본 content와 호환용 html 필드를 함께 받는다. */
const architecturePlanSchema: z.ZodType<ArchitecturePlan> =
  artifactDocumentSchema.extend({
    html: z.string(),
  });

/** Dineug ERD는 record 단위 오류 격리를 위해 nullable JSON 문자열로 수신한다. */
const erdSchema: z.ZodType<Erd> = artifactRecordSchema.extend({
  document: z.string().nullable(),
});

/** Request 목록의 lifecycle status를 포함한 document schema. */
const requestSchema: z.ZodType<Request> = artifactDocumentSchema.extend({
  status: requestStatusSchema,
});

/** Request 생성 입력의 빈 제목과 본문을 API 호출 전에 차단한다. */
const requestDocumentInputSchema = z.object({
  title: z.string().trim().min(1),
  content: z.string().trim().min(1),
});
export const createRequestInputSchema: z.ZodType<CreateRequestInput> =
  requestDocumentInputSchema;

/** Request 수정 입력에 lifecycle 상태 검증을 추가한다. */
export const updateRequestInputSchema: z.ZodType<UpdateRequestInput> =
  requestDocumentInputSchema.extend({
    status: requestStatusSchema,
  });

/** Request 생성·수정 API의 단건 `{ data }` 응답을 검증한다. */
export const requestResponseSchema: z.ZodType<{ data: Request }> = z.object({
  data: requestSchema,
});

const taskSchema: z.ZodType<Task> = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  planId: z.number().int().positive(),
  status: taskStatusSchema,
  title: z.string(),
  content: z.string().nullable(),
});

const planSchema: z.ZodType<Plan> = artifactDocumentSchema.extend({
  status: planStatusSchema,
  tasks: z.array(taskSchema),
});

/** Plan 목록 API의 `{ data }` 응답을 검증한다. */
export const planListResponseSchema: z.ZodType<ListResponse<Plan>> = z.object({
  data: z.array(planSchema),
});

/** Draft 목록 API의 `{ data }` 응답을 검증한다. */
export const draftListResponseSchema: z.ZodType<ListResponse<Draft>> = z.object({
  data: z.array(artifactDocumentSchema),
});

/** Task 목록 API의 `{ data }` 응답을 검증한다. */
export const taskListResponseSchema: z.ZodType<ListResponse<Task>> = z.object({
  data: z.array(taskSchema),
});

/** Domain 목록 API의 `{ data }` 응답을 검증한다. */
export const domainListResponseSchema: z.ZodType<ListResponse<Domain>> = z.object({
  data: z.array(domainSchema),
});

/** Architecture 목록 API의 `{ data }` 응답을 검증한다. */
export const architectureListResponseSchema: z.ZodType<
  ListResponse<Architecture>
> = z.object({
  data: z.array(artifactDocumentSchema),
});

/** Wireframe 목록 API의 `{ data }` 응답을 검증한다. */
export const wireframeListResponseSchema: z.ZodType<ListResponse<Wireframe>> =
  z.object({
    data: z.array(wireframeSchema),
  });

/** Asset 목록 API의 `{ data }` 응답을 검증한다. */
export const assetListResponseSchema: z.ZodType<ListResponse<Asset>> = z.object({
  data: z.array(assetSchema),
});

/** Review 목록 API의 `{ data }` 응답을 검증한다. */
export const reviewListResponseSchema: z.ZodType<ListResponse<Review>> = z.object({
  data: z.array(reviewSchema),
});

/** Request 목록 API의 `{ data }` 응답을 검증한다. */
export const requestListResponseSchema: z.ZodType<ListResponse<Request>> =
  z.object({
    data: z.array(requestSchema),
  });

/** WorkLog 목록 API의 `{ data }` 응답을 검증한다. */
export const workLogListResponseSchema: z.ZodType<ListResponse<WorkLog>> =
  z.object({
    data: z.array(workLogSchema),
  });

/** Architecture Plan 목록 API의 `{ data }` 응답을 검증한다. */
export const architecturePlanListResponseSchema: z.ZodType<
  ListResponse<ArchitecturePlan>
> = z.object({
  data: z.array(architecturePlanSchema),
});

/** DB schema 목록 API의 `{ data }` 응답을 검증한다. */
export const databaseListResponseSchema: z.ZodType<ListResponse<Database>> =
  z.object({
    data: z.array(databaseSchema),
  });

/** ERD 목록 API의 `{ data }` 응답을 검증한다. */
export const erdListResponseSchema: z.ZodType<ListResponse<Erd>> = z.object({
  data: z.array(erdSchema),
});

export const projectSummarySchema: z.ZodType<ProjectSummary> =
  projectBaseSchema.extend({
    _count: artifactCountsSchema,
  });

/** Project 목록 API의 `{ data }` 응답을 검증한다. */
export const projectListResponseSchema: z.ZodType<
  ListResponse<ProjectSummary>
> = z.object({
  data: z.array(projectSummarySchema),
});

export const projectContextSchema: z.ZodType<ProjectContext> =
  projectBaseSchema.extend({
    plans: z.array(planSchema),
    tasks: z.array(taskSchema),
    drafts: z.array(artifactDocumentSchema),
    domains: z.array(domainSchema),
    architectures: z.array(artifactDocumentSchema),
    wireframes: z.array(wireframeSchema),
    assets: z.array(assetSchema),
    reviews: z.array(reviewSchema),
    requests: z.array(requestSchema),
    workLogs: z.array(workLogSchema),
    architecturePlans: z.array(architecturePlanSchema),
    databases: z.array(databaseSchema),
    erds: z.array(erdSchema),
  });

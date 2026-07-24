import { z } from "zod";
import type {
  Architecture,
  ArtifactDocument,
  ArtifactRecord,
  Asset,
  Design,
  Domain,
  Draft,
  ListResponse,
  Plan,
  ProjectContext,
  ProjectSummary,
  Review,
  Task,
  Wireframe,
} from "@/types/dashboard";

const repoTypeSchema = z.enum(["LOCAL", "REMOTE"]);
const projectRepositorySchema = z.object({
  path: z.string().min(1),
  repoType: repoTypeSchema,
});
const taskStatusSchema = z.enum(["PENDING", "COMPLETED"]);
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
  designs: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
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
});
const assetSchema: z.ZodType<Asset> = htmlArtifactSchema;

const designSchema: z.ZodType<Design> = htmlArtifactSchema.extend({
  wireframeId: z.number().int().positive(),
  assetId: z.number().int().positive(),
  wireframe: wireframeSchema,
  asset: assetSchema,
});

const reviewSchema: z.ZodType<Review> = artifactDocumentSchema;

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
  version: z.number().int().positive(),
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
  data: z.array(artifactDocumentSchema),
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

/** Design 목록 API의 `{ data }` 응답을 검증한다. */
export const designListResponseSchema: z.ZodType<ListResponse<Design>> = z.object({
  data: z.array(designSchema),
});

/** Review 목록 API의 `{ data }` 응답을 검증한다. */
export const reviewListResponseSchema: z.ZodType<ListResponse<Review>> = z.object({
  data: z.array(reviewSchema),
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
    domains: z.array(artifactDocumentSchema),
    architectures: z.array(artifactDocumentSchema),
    wireframes: z.array(wireframeSchema),
    assets: z.array(assetSchema),
    designs: z.array(designSchema),
    reviews: z.array(reviewSchema),
  });

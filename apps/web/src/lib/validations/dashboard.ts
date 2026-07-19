import { z } from "zod";
import type {
  ArtifactDocument,
  Asset,
  Design,
  Plan,
  ProjectContext,
  ProjectSummary,
  Task,
  Wireframe,
} from "@/types/dashboard";

const repoTypeSchema = z.enum(["LOCAL", "REMOTE"]);
const taskStatusSchema = z.enum(["PENDING", "COMPLETED"]);
const dateTimeSchema = z.iso.datetime();

const projectBaseSchema = z.object({
  id: z.number().int().positive(),
  title: z.string(),
  repoPath: z.string(),
  repoType: repoTypeSchema,
  description: z.string(),
});

const artifactCountsSchema = z.object({
  plans: z.number().int().nonnegative(),
  tasks: z.number().int().nonnegative(),
  drafts: z.number().int().nonnegative(),
  architectures: z.number().int().nonnegative(),
  wireframes: z.number().int().nonnegative(),
  assets: z.number().int().nonnegative(),
  designs: z.number().int().nonnegative(),
  reviews: z.number().int().nonnegative(),
});

const artifactDocumentSchema = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive(),
  createdAt: dateTimeSchema,
  updatedAt: dateTimeSchema,
  title: z.string(),
  content: z.string(),
}) satisfies z.ZodType<ArtifactDocument>;

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

const wireframeSchema: z.ZodType<Wireframe> = artifactDocumentSchema;
const assetSchema: z.ZodType<Asset> = artifactDocumentSchema;

const designSchema: z.ZodType<Design> = artifactDocumentSchema.extend({
  wireframeId: z.number().int().positive(),
  assetId: z.number().int().positive(),
  wireframe: wireframeSchema,
  asset: assetSchema,
});

export const projectSummarySchema: z.ZodType<ProjectSummary> =
  projectBaseSchema.extend({
    _count: artifactCountsSchema,
  });

export const projectContextSchema: z.ZodType<ProjectContext> =
  projectBaseSchema.extend({
    plans: z.array(planSchema),
    tasks: z.array(taskSchema),
    drafts: z.array(artifactDocumentSchema),
    architectures: z.array(artifactDocumentSchema),
    wireframes: z.array(wireframeSchema),
    assets: z.array(assetSchema),
    designs: z.array(designSchema),
    reviews: z.array(artifactDocumentSchema),
  });

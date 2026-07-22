import { describe, expect, it } from "vitest";
import {
  designListResponseSchema,
  draftListResponseSchema,
  planListResponseSchema,
  projectListResponseSchema,
  reviewListResponseSchema,
  taskListResponseSchema,
} from "@/lib/validations/dashboard";
import {
  createArtifact,
  createDesign,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createReview,
  createTask,
} from "@/test/fixtures/dashboard";

const cases = [
  [
    "projects",
    projectListResponseSchema,
    createProjectSummary(createProjectContext()),
  ],
  ["plans", planListResponseSchema, createPlan()],
  ["drafts", draftListResponseSchema, createArtifact()],
  ["tasks", taskListResponseSchema, createTask()],
  ["designs", designListResponseSchema, createDesign()],
  ["reviews", reviewListResponseSchema, createReview()],
] as const;

describe("project-scoped list response schemas", () => {
  for (const [resource, schema, record] of cases) {
    it(`${resource}는 { data: record[] } envelope만 허용한다`, () => {
      expect(schema.safeParse({ data: [record] }).success).toBe(true);
      expect(schema.safeParse([record]).success).toBe(false);
      expect(schema.safeParse({ records: [record] }).success).toBe(false);
    });
  }
});

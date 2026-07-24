import { describe, expect, it } from "vitest";
import type { Wireframe } from "@/types/dashboard";
import {
  designListResponseSchema,
  draftListResponseSchema,
  planListResponseSchema,
  projectListResponseSchema,
  reviewListResponseSchema,
  taskListResponseSchema,
  wireframeListResponseSchema,
} from "@/lib/validations/dashboard";
import {
  createArtifact,
  createDesign,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createReview,
  createTask,
  createWireframe,
} from "@/test/fixtures/dashboard";

const wireframe = {
  id: 7,
  projectId: 1,
  createdAt: "2026-07-18T01:00:00.000Z",
  updatedAt: "2026-07-18T02:00:00.000Z",
  parentId: 3,
  index: "1.2",
  title: "Checkout",
  html: "<!doctype html><html><head><title>Checkout</title></head><body><main>Checkout</main></body></html>",
} satisfies Wireframe;

const cases = [
  [
    "projects",
    projectListResponseSchema,
    createProjectSummary(createProjectContext()),
  ],
  ["plans", planListResponseSchema, createPlan()],
  ["drafts", draftListResponseSchema, createArtifact()],
  ["tasks", taskListResponseSchema, createTask()],
  ["wireframes", wireframeListResponseSchema, wireframe],
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

  it("wireframes는 nullable parentId와 계층 index path를 누락 없이 유지한다", () => {
    const previousStep = {
      ...wireframe,
      id: 6,
      parentId: null,
      index: "1",
      title: "Cart",
    };
    const parsed = wireframeListResponseSchema.parse({
      data: [wireframe, previousStep],
    });

    expect(
      parsed.data.map(({ parentId, index }) => ({ parentId, index })),
    ).toEqual([
      { parentId: 3, index: "1.2" },
      { parentId: null, index: "1" },
    ]);

    for (const invalidIndex of [
      undefined,
      1,
      0,
      "",
      "0",
      "01",
      "1.0",
      "1.01",
      ".1",
      "1.",
      "1..1",
      "1.-1",
      "a",
      "1".repeat(256),
    ]) {
      expect(
        wireframeListResponseSchema.safeParse({
          data: [{ ...wireframe, index: invalidIndex }],
        }).success,
      ).toBe(false);
    }

    const { parentId: _parentId, ...missingParent } = wireframe;
    expect(
      wireframeListResponseSchema.safeParse({ data: [missingParent] }).success,
    ).toBe(false);
    for (const invalidParentId of [0, -1, 1.5, "1"]) {
      expect(
        wireframeListResponseSchema.safeParse({
          data: [{ ...wireframe, parentId: invalidParentId }],
        }).success,
      ).toBe(false);
    }

    expect(
      wireframeListResponseSchema.parse({
        data: [{ ...wireframe, index: "  1.10  " }],
      }).data[0]?.index,
    ).toBe("1.10");
  });

  it("createWireframe fixture는 root 계층 기본값을 제공한다", () => {
    expect(createWireframe()).toMatchObject({
      parentId: null,
      index: "1",
    });
  });
});

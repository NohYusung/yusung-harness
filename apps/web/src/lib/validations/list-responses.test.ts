import { describe, expect, it } from "vitest";
import type { Wireframe } from "@/types/dashboard";
import {
  architecturePlanListResponseSchema,
  databaseListResponseSchema,
  designListResponseSchema,
  draftListResponseSchema,
  erdListResponseSchema,
  planListResponseSchema,
  projectListResponseSchema,
  reviewListResponseSchema,
  taskListResponseSchema,
  wireframeListResponseSchema,
  workLogListResponseSchema,
} from "@/lib/validations/dashboard";
import {
  createArchitecturePlan,
  createArtifact,
  createDatabase,
  createDesign,
  createErd,
  createErdDocument,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createReview,
  createTask,
  createWireframe,
  createWorkLog,
} from "@/test/fixtures/dashboard";

const wireframe = {
  id: 7,
  projectId: 1,
  createdAt: "2026-07-18T01:00:00.000Z",
  updatedAt: "2026-07-18T02:00:00.000Z",
  parentId: 3,
  index: "1.2",
  version: 3,
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
  ["worklogs", workLogListResponseSchema, createWorkLog()],
  [
    "architecture plans",
    architecturePlanListResponseSchema,
    createArchitecturePlan(),
  ],
  ["databases", databaseListResponseSchema, createDatabase()],
  ["erds", erdListResponseSchema, createErd()],
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

    const missingParent: Partial<typeof wireframe> = { ...wireframe };
    delete missingParent.parentId;
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

  it("plans는 version 없이 lifecycle status를 필수로 검증하고 보존한다", () => {
    for (const status of ["PENDING", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(
        planListResponseSchema.parse({
          data: [createPlan({ status })],
        }).data[0],
      ).toMatchObject({ status });
    }

    const plan = createPlan();
    const missingStatus: Partial<typeof plan> = { ...plan };
    delete missingStatus.status;
    expect(
      planListResponseSchema.safeParse({ data: [missingStatus] }).success,
    ).toBe(false);
    expect(
      planListResponseSchema.parse({
        data: [{ ...plan, version: 4 }],
      }).data[0],
    ).not.toHaveProperty("version");
  });

  it("wireframes는 양의 정수 version을 필수로 검증하고 응답에 유지한다", () => {
    expect(
      wireframeListResponseSchema.parse({ data: [wireframe] }).data[0],
    ).toMatchObject({ version: 3 });

    for (const invalidVersion of [undefined, 0, -1, 1.5, "3"]) {
      expect(
        wireframeListResponseSchema.safeParse({
          data: [{ ...wireframe, version: invalidVersion }],
        }).success,
      ).toBe(false);
    }
  });

  it("designs는 양의 정수 version을 필수로 검증하고 응답에 유지한다", () => {
    const design = { ...createDesign(), version: 3 };

    expect(
      designListResponseSchema.parse({ data: [design] }).data[0],
    ).toMatchObject({ version: 3 });

    for (const invalidVersion of [undefined, 0, -1, 1.5, "3"]) {
      expect(
        designListResponseSchema.safeParse({
          data: [{ ...design, version: invalidVersion }],
        }).success,
      ).toBe(false);
    }
  });

  it("createWireframe fixture는 root 계층과 version 기본값을 제공한다", () => {
    expect(createWireframe()).toMatchObject({
      parentId: null,
      index: "1",
      version: 1,
    });
  });

  it("createDesign fixture는 version 기본값을 제공한다", () => {
    expect(createDesign()).toMatchObject({ version: 1 });
  });

  it("Architecture Plan은 full HTML content와 빈 호환 html 필드를 그대로 보존한다", () => {
    const architecturePlan = createArchitecturePlan({ html: "" });
    const parsed = architecturePlanListResponseSchema.parse({
      data: [architecturePlan],
    });

    expect(parsed.data[0]).toMatchObject({
      content: architecturePlan.content,
      html: "",
    });
  });

  it("ERD는 nullable Dineug document 문자열을 보존하고 legacy 필드를 공개 shape에서 제거한다", () => {
    expect(
      erdListResponseSchema.safeParse({ data: [createErd()] }).success,
    ).toBe(true);
    expect(
      erdListResponseSchema.safeParse({
        data: [createErd({ document: null })],
      }).success,
    ).toBe(true);
    const parsedLegacyFields = erdListResponseSchema.parse({
      data: [
        {
          ...createErd(),
          html: "<!doctype html><html><head></head><body>Legacy ERD</body></html>",
          legacyScene: '{"type":"excalidraw","version":2}',
          legacyHtml: "<!doctype html><html><body>Private legacy ERD</body></html>",
        },
      ],
    });
    expect(parsedLegacyFields.data[0]).not.toHaveProperty("html");
    expect(parsedLegacyFields.data[0]).not.toHaveProperty("legacyScene");
    expect(parsedLegacyFields.data[0]).not.toHaveProperty("legacyHtml");
    expect(
      erdListResponseSchema.parse({
        data: [createErd({ document: JSON.stringify(createErdDocument()) })],
      }).data[0]?.document,
    ).toBe(JSON.stringify(createErdDocument()));
  });
});

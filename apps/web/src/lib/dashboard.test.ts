import { describe, expect, it } from "vitest";
import { deriveDashboardSummary } from "@/lib/dashboard";
import {
  createArtifact,
  createAsset,
  createDesign,
  createPlan,
  createProjectContext,
  createReview,
  createTask,
  createWireframe,
} from "@/test/fixtures/dashboard";

describe("deriveDashboardSummary", () => {
  it("산출물이 없으면 안전한 0/null 요약을 반환한다", () => {
    expect(deriveDashboardSummary(createProjectContext())).toEqual({
      totalArtifacts: 0,
      completedTasks: 0,
      totalTasks: 0,
      taskCompletionPercent: 0,
      completedPlans: 0,
      totalPlans: 0,
      lastActivityAt: null,
    });
  });

  it("9종 산출물 합계와 Task·Plan 완료율, 마지막 활동을 계산한다", () => {
    const completedTask = createTask({ id: 1, status: "COMPLETED" });
    const pendingTask = createTask({ id: 2, status: "PENDING" });
    const context = createProjectContext({
      plans: [
        createPlan({
          id: 10,
          status: "COMPLETED",
          tasks: [completedTask, pendingTask],
        }),
        createPlan({ id: 11, status: "IN_PROGRESS" }),
      ],
      tasks: [completedTask, pendingTask],
      drafts: [createArtifact({ id: 3, title: "Draft" })],
      domains: [createArtifact({ id: 9, title: "Domain" })],
      architectures: [createArtifact({ id: 4, title: "Architecture" })],
      wireframes: [createWireframe({ id: 5, title: "Wireframe" })],
      assets: [createAsset({ id: 6, title: "Asset" })],
      designs: [
        createDesign({
          id: 7,
          title: "Design",
          wireframeId: 5,
          assetId: 6,
          wireframe: createWireframe({ id: 5, title: "Wireframe" }),
          asset: createAsset({ id: 6, title: "Asset" }),
        }),
      ],
      reviews: [
        createReview({
          id: 8,
          title: "Review",
          updatedAt: "2026-07-20T09:30:00.000Z",
        }),
      ],
    });

    expect(deriveDashboardSummary(context)).toEqual({
      totalArtifacts: 11,
      completedTasks: 1,
      totalTasks: 2,
      taskCompletionPercent: 50,
      completedPlans: 1,
      totalPlans: 2,
      lastActivityAt: "2026-07-20T09:30:00.000Z",
    });
  });
});

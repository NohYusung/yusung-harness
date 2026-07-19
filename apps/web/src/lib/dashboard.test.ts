import { describe, expect, it } from "vitest";
import { deriveDashboardSummary } from "@/lib/dashboard";
import {
  createArtifact,
  createPlan,
  createProjectContext,
  createTask,
} from "@/test/fixtures/dashboard";

describe("deriveDashboardSummary", () => {
  it("산출물이 없으면 안전한 0/null 요약을 반환한다", () => {
    expect(deriveDashboardSummary(createProjectContext())).toEqual({
      totalArtifacts: 0,
      completedTasks: 0,
      totalTasks: 0,
      taskCompletionPercent: 0,
      latestPlanVersion: null,
      lastActivityAt: null,
    });
  });

  it("8종 산출물 합계와 작업 완료율, 최신 계획, 마지막 활동을 계산한다", () => {
    const completedTask = createTask({ id: 1, status: "COMPLETED" });
    const pendingTask = createTask({ id: 2, status: "PENDING" });
    const context = createProjectContext({
      plans: [createPlan({ version: 4, tasks: [completedTask, pendingTask] })],
      tasks: [completedTask, pendingTask],
      drafts: [createArtifact({ id: 3, title: "초안" })],
      architectures: [createArtifact({ id: 4, title: "아키텍처" })],
      wireframes: [createArtifact({ id: 5, title: "와이어프레임" })],
      assets: [createArtifact({ id: 6, title: "에셋" })],
      designs: [
        {
          ...createArtifact({ id: 7, title: "디자인" }),
          wireframeId: 5,
          assetId: 6,
          wireframe: createArtifact({ id: 5, title: "와이어프레임" }),
          asset: createArtifact({ id: 6, title: "에셋" }),
        },
      ],
      reviews: [
        createArtifact({
          id: 8,
          title: "리뷰",
          updatedAt: "2026-07-20T09:30:00.000Z",
        }),
      ],
    });

    expect(deriveDashboardSummary(context)).toEqual({
      totalArtifacts: 9,
      completedTasks: 1,
      totalTasks: 2,
      taskCompletionPercent: 50,
      latestPlanVersion: 4,
      lastActivityAt: "2026-07-20T09:30:00.000Z",
    });
  });
});

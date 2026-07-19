import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ArtifactBrowser } from "./ArtifactBrowser";
import {
  createArtifact,
  createPlan,
  createProjectContext,
  createTask,
} from "@/test/fixtures/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("ArtifactBrowser", () => {
  it("다른 산출물이 있어도 선택한 빈 카테고리의 로컬 empty 상태를 표시한다", () => {
    const context = createProjectContext({
      drafts: [createArtifact({ title: "초안 1" })],
    });

    render(
      <ArtifactBrowser
        activeRelation="reviews"
        context={context}
        selectedArtifactId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "리뷰 0" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "저장된 리뷰가 없습니다" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("아직 저장된 산출물이 없습니다"),
    ).not.toBeInTheDocument();
  });

  it("선택 카테고리 count와 plan의 task 완료수를 렌더한다", () => {
    const completedTask = createTask({ id: 1, status: "COMPLETED" });
    const pendingTask = createTask({ id: 2, status: "PENDING" });
    const context = createProjectContext({
      plans: [
        createPlan({
          version: 3,
          tasks: [completedTask, pendingTask],
        }),
      ],
    });

    render(
      <ArtifactBrowser
        activeRelation="plans"
        context={context}
        selectedArtifactId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "계획 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("v3 · 작업 1/2 완료")).toBeInTheDocument();
  });

  it("task count와 완료/대기 상태를 텍스트로 구분한다", () => {
    const context = createProjectContext({
      tasks: [
        createTask({ id: 1, planId: 3, status: "COMPLETED", title: "완료 작업" }),
        createTask({ id: 2, planId: 3, status: "PENDING", title: "대기 작업" }),
      ],
    });

    render(
      <ArtifactBrowser
        activeRelation="tasks"
        context={context}
        selectedArtifactId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "작업 2" }),
    ).toBeInTheDocument();
    expect(screen.getByText("완료 · plan #3")).toBeInTheDocument();
    expect(screen.getByText("대기 · plan #3")).toBeInTheDocument();
  });
});

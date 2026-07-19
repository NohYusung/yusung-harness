import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import {
  createProjectContext,
  createProjectSummary,
  createTask,
} from "@/test/fixtures/dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("Dashboard", () => {
  it("빈 프로젝트의 0 요약과 전체 empty 상태를 렌더한다", () => {
    const context = createProjectContext();

    render(
      <Dashboard
        activeRelation={null}
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Yusung Harness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "아직 저장된 산출물이 없습니다" }),
    ).toBeInTheDocument();

    const summary = screen.getByRole("region", { name: "프로젝트 요약" });
    expect(within(summary).getByText("0 / 0")).toBeInTheDocument();
    expect(within(summary).getByText("—")).toBeInTheDocument();

    const progress = within(summary).getByRole("progressbar", {
      name: "완료된 작업 비율",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "0");
    expect(progress).toHaveAttribute("aria-valuetext", "0/0 완료");
  });

  it("summary에 8종 산출물 count와 task progress를 표시한다", () => {
    const completedTask = createTask({ id: 1, status: "COMPLETED" });
    const pendingTask = createTask({ id: 2, status: "PENDING" });
    const context = createProjectContext({
      plans: [],
      tasks: [completedTask, pendingTask],
      drafts: [],
      architectures: [],
      wireframes: [],
      assets: [],
      designs: [],
      reviews: [],
    });

    render(
      <Dashboard
        activeRelation="tasks"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
      />,
    );

    const summary = screen.getByRole("region", { name: "프로젝트 요약" });
    expect(within(summary).getByText("2")).toBeInTheDocument();
    expect(within(summary).getByText("1 / 2")).toBeInTheDocument();

    const progress = within(summary).getByRole("progressbar", {
      name: "완료된 작업 비율",
    });
    expect(progress).toHaveAttribute("aria-valuenow", "50");
    expect(progress).toHaveAttribute("aria-valuetext", "1/2 완료");
  });
});

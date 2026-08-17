import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAsset,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createTask,
  createWireframe,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const routerPush = vi.hoisted(() => vi.fn());
const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: routerReplace,
  }),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    routerPush.mockClear();
    routerReplace.mockClear();
  });

  it("통합 Workbench에서 project 전환과 Plan 중심 record inventory를 제공한다", () => {
    const completedTask = createTask({ id: 41, status: "COMPLETED" });
    const pendingTask = createTask({ id: 42, status: "PENDING" });
    const context = createProjectContext({
      plans: [createPlan({ id: 40, tasks: [completedTask, pendingTask] })],
      tasks: [completedTask, pendingTask],
      wireframes: [createWireframe({ id: 43 })],
    });
    const anotherContext = createProjectContext({
      id: 2,
      repoPaths: [
        {
          path: "https://github.com/yusung/remote-agent-commerce",
          repoType: "REMOTE",
        },
      ],
      title: "Remote Agent Commerce",
    });

    render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={[
          createProjectSummary(context),
          createProjectSummary(anotherContext),
        ]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const topbar = screen.getByRole("banner");
    expect(
      within(topbar).queryByText("Yusung Harness", { selector: "strong" }),
    ).not.toBeInTheDocument();
    expect(
      within(topbar).queryByText("Artifact Workbench"),
    ).not.toBeInTheDocument();
    const projectTrigger = within(topbar).getByRole("button", {
      name: "Switch project. Current project: Yusung Harness",
    });
    fireEvent.click(projectTrigger);
    expect(
      screen.getByRole("link", { name: /Remote Agent Commerce/ }),
    ).toHaveAttribute("href", "/projects/2");

    const projectTree = screen.getByRole("complementary", {
      name: "Project artifact tree",
    });
    expect(within(projectTree).queryByRole("combobox")).not.toBeInTheDocument();

    const explorer = screen.getByRole("navigation", {
      name: "Artifact types",
    });
    expect(
      within(explorer).queryByRole("button", { name: /All records/ }),
    ).not.toBeInTheDocument();
    expect(
      within(explorer).queryByRole("button", { name: /^Tasks/ }),
    ).not.toBeInTheDocument();
    for (const label of [
      "Plans",
      "Research",
      "Domains",
      "Architecture",
      "Wireframes",
      "Assets",
      "Reviews",
    ]) {
      expect(
        within(explorer).getByRole("button", {
          name: new RegExp(`^${label}\\s*\\d+$`),
        }),
      ).toBeInTheDocument();
    }
  });

  it("수동 새로고침 제어를 렌더하지 않는다", () => {
    const context = createProjectContext();

    render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.queryByRole("button", {
        name: /refresh|syncing|새로고침|동기화/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("HTML record 상세 영역에서 sandboxed iframe을 즉시 렌더한다", () => {
    const asset = createAsset({
      html: "<!doctype html><html><body>Workbench preview state</body></html>",
      id: 51,
      title: "Preview asset",
    });
    const context = createProjectContext({
      assets: [asset],
    });

    render(
      <Dashboard
        activeRelation="assets"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={asset.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Preview asset",
    });
    expect(
      within(detailPane).queryByRole("tablist", { name: "Record details" }),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("tab"),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("tabpanel"),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).getByText("Record metadata"),
    ).toBeInTheDocument();
    expect(detailPane.querySelector("dl")).not.toBeNull();
    expect(
      within(detailPane).getByText("Asset", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(document.querySelector("#preview-panel")).toBeNull();
    expect(document.querySelector("#relations-panel")).toBeNull();

    const preview = within(detailPane).getByTitle(
      "Preview asset HTML preview",
    );
    expect(preview).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Workbench preview state"),
    );
    expect(preview).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-Security-Policy"),
    );

    expect(
      screen.queryByRole("button", { name: "Open Asset preview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open isolated preview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", {
        name: "Asset preview: Preview asset",
      }),
    ).not.toBeInTheDocument();
  });
});

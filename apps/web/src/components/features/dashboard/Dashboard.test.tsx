import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createAsset,
  createDesign,
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
    expect(within(topbar).getByText("Yusung Harness")).toBeInTheDocument();
    expect(
      within(topbar).queryByText("Artifact Workbench"),
    ).not.toBeInTheDocument();
    const projectSelect = screen.getByRole("combobox", { name: "Project" });
    expect(projectSelect).toHaveValue("1");
    expect(
      within(projectSelect).getByRole("option", {
        name: "Remote Agent Commerce · REMOTE",
      }),
    ).toBeInTheDocument();

    fireEvent.change(projectSelect, { target: { value: "2" } });
    expect(routerPush).toHaveBeenCalledWith("/projects/2");

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
      "Drafts",
      "Domain",
      "Architecture",
      "Wireframes",
      "Assets",
      "Designs",
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
    const asset = createAsset({ id: 51, title: "Preview asset" });
    const wireframe = createWireframe({ id: 52, title: "Preview wireframe" });
    const design = createDesign({
      asset,
      assetId: asset.id,
      html: "<!doctype html><html><body>Workbench preview state</body></html>",
      id: 53,
      title: "Preview design",
      wireframe,
      wireframeId: wireframe.id,
    });
    const context = createProjectContext({
      assets: [asset],
      designs: [design],
      wireframes: [wireframe],
    });

    render(
      <Dashboard
        activeRelation="designs"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={design.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Preview design",
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
      within(detailPane).getByText("Design", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(document.querySelector("#preview-panel")).toBeNull();
    expect(document.querySelector("#relations-panel")).toBeNull();

    const preview = within(detailPane).getByTitle(
      "Preview design HTML preview · Desktop 1440 × 900",
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
      screen.queryByRole("button", { name: "Open Design preview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Open isolated preview" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", {
        name: "Design preview: Preview design",
      }),
    ).not.toBeInTheDocument();
  });
});

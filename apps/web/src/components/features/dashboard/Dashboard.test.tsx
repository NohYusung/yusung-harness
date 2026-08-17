import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArchitecture,
  createArtifact,
  createAsset,
  createDatabase,
  createDomain,
  createErd,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createRequest,
  createReview,
  createTask,
  createWireframe,
  createWorkLog,
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

  it("통합 Workbench에서 project 전환과 두 관리 모델의 정확한 record inventory를 제공한다", () => {
    const completedTask = createTask({ id: 41, status: "COMPLETED" });
    const pendingTask = createTask({ id: 42, status: "PENDING" });
    const context = createProjectContext({
      architectures: [
        createArchitecture({ id: 50, type: "PLAN" }),
        createArchitecture({ id: 51, type: "PRODUCTION" }),
      ],
      assets: [createAsset({ id: 44 })],
      databases: [createDatabase({ id: 48 })],
      domains: [createDomain({ id: 47 })],
      erds: [createErd({ id: 49 })],
      plans: [createPlan({ id: 40, tasks: [completedTask, pendingTask] })],
      requests: [createRequest({ id: 46 })],
      research: [createArtifact({ id: 43, title: "Research" })],
      reviews: [createReview({ id: 52 })],
      tasks: [completedTask, pendingTask],
      wireframes: [createWireframe({ id: 45 })],
      workLogs: [createWorkLog({ id: 53 })],
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

    const planningSection = within(explorer).getByRole("group", {
      name: "Planning & Work",
    });
    const statusSection = within(explorer).getByRole("group", {
      name: "Project Status",
    });
    const architecturePlanButton = within(planningSection).getByRole(
      "button",
      { name: "Architecture Plan 1" },
    );
    const currentArchitectureButton = within(statusSection).getByRole(
      "button",
      { name: "Current Architecture 1" },
    );
    const planningButtons = [
      within(planningSection).getByRole("button", { name: "Plans 1" }),
      within(planningSection).getByRole("button", { name: "Research 1" }),
      architecturePlanButton,
      within(planningSection).getByRole("button", { name: "Assets 1" }),
      within(planningSection).getByRole("button", { name: "Wireframes 1" }),
      within(planningSection).getByRole("button", { name: "Requests 1" }),
      within(planningSection).getByRole("button", { name: "WorkLogs 1" }),
    ];
    const statusButtons = [
      currentArchitectureButton,
      within(statusSection).getByRole("button", { name: "DB 1" }),
      within(statusSection).getByRole("button", { name: "ERD 1" }),
      within(statusSection).getByRole("button", { name: "Domains 1" }),
      within(statusSection).getByRole("button", { name: "Reviews 1" }),
    ];

    expect(within(planningSection).getAllByRole("button")).toEqual(
      planningButtons,
    );
    expect(within(statusSection).getAllByRole("button")).toEqual(
      statusButtons,
    );
    expect(within(architecturePlanButton).getByText("AP")).toBeInTheDocument();
    expect(
      within(currentArchitectureButton).getByText("CA"),
    ).toBeInTheDocument();
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

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Dashboard } from "./Dashboard";
import {
  createArtifact,
  createAsset,
  createDesign,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createTask,
  createWireframe,
} from "@/test/fixtures/dashboard";

const routerReplace = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
  }),
}));

describe("Dashboard", () => {
  beforeEach(() => {
    routerReplace.mockClear();
  });

  it("상단 menu는 Plan, Draft, Domain, Architecture, Wireframe, Asset, Design을 렌더한다", () => {
    const design = createDesign({ id: 22, title: "Navigation design" });
    const context = createProjectContext({
      assets: [createAsset({ id: 21, title: "Navigation asset" })],
      designs: [design],
      wireframes: [
        createWireframe({ id: 20, title: "Navigation wireframe" }),
      ],
    });
    const anotherContext = createProjectContext({
      id: 2,
      title: "Remote Agent Commerce",
      repoPaths: [
        {
          path: "https://github.com/yusung/remote-agent-commerce",
          repoType: "REMOTE",
        },
      ],
    });

    const projects = [
      createProjectSummary(context),
      createProjectSummary(anotherContext),
    ];
    const { rerender } = render(
      <Dashboard
        activeRelation="wireframes"
        context={context}
        projects={projects}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Yusung Harness" }),
    ).toBeInTheDocument();
    const repositoryLabels = screen.getAllByTitle(
      /workspace\/yusung-harness-backend/,
    );
    expect(repositoryLabels.length).toBeGreaterThan(0);
    expect(repositoryLabels[0]).toHaveAttribute(
      "title",
      "/workspace/yusung-harness-backend\n/workspace/yusung-harness-web",
    );
    expect(
      screen.queryByRole("heading", { name: /Recent Artifacts/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    const sidebar = screen.getByRole("complementary");
    const projectNavigation = within(sidebar).getByRole("navigation", {
      name: "Project list",
    });
    expect(
      within(projectNavigation).getByRole("link", { name: /Yusung Harness/ }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(projectNavigation).getByRole("link", {
        name: /Remote Agent Commerce/,
      }),
    ).toHaveAttribute("href", "/projects/2");
    expect(
      within(projectNavigation).queryByRole("link", { name: /Plan/ }),
    ).not.toBeInTheDocument();

    const workspaceNavigation = screen.getByRole("navigation", {
      name: "Project artifacts",
    });
    expect(
      within(workspaceNavigation)
        .getAllByRole("link")
        .map((link) => link.getAttribute("aria-label")),
    ).toEqual([
      "Plan 0",
      "Draft 0",
      "Domain 0",
      "Architecture 0",
      "Wireframe 1",
      "Asset 1",
      "Design 1",
    ]);
    expect(
      within(workspaceNavigation).getByRole("link", { name: /Plan\s*0/ }),
    ).toHaveAttribute("href", "/projects/1?type=plans");
    expect(
      within(workspaceNavigation).getByRole("link", {
        name: "Wireframe 1",
      }),
    ).toHaveAttribute("href", "/projects/1?type=wireframes");
    expect(
      within(workspaceNavigation).getByRole("link", {
        name: "Wireframe 1",
      }),
    ).toHaveAttribute("aria-current", "page");
    expect(
      within(workspaceNavigation).getByRole("link", { name: "Asset 1" }),
    ).toHaveAttribute("href", "/projects/1?type=assets");
    expect(
      within(workspaceNavigation).getByRole("link", { name: "Asset 1" }),
    ).not.toHaveAttribute("aria-current");
    expect(
      within(workspaceNavigation).getByRole("link", { name: "Design 1" }),
    ).toHaveAttribute("href", "/projects/1?type=designs");
    expect(
      within(workspaceNavigation).getByRole("link", { name: "Design 1" }),
    ).not.toHaveAttribute("aria-current");
    expect(within(workspaceNavigation).queryByRole("link", { name: /Task/ })).not.toBeInTheDocument();
    expect(within(workspaceNavigation).queryByRole("link", { name: /Project/ })).not.toBeInTheDocument();

    rerender(
      <Dashboard
        activeRelation="designs"
        context={context}
        projects={projects}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );
    expect(
      within(workspaceNavigation).getByRole("link", { name: "Design 1" }),
    ).toHaveAttribute("aria-current", "page");
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

  it("desktop sidebar를 Workbench Explorer와 project inventory로 렌더한다", () => {
    const completedTask = createTask({ id: 41, status: "COMPLETED" });
    const pendingTask = createTask({ id: 42, status: "PENDING" });
    const context = createProjectContext({
      plans: [createPlan({ id: 40, tasks: [completedTask, pendingTask] })],
      tasks: [completedTask, pendingTask],
      wireframes: [createWireframe({ id: 43 })],
    });

    render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const explorer = screen.getByRole("complementary", {
      name: "Project explorer",
    });
    expect(within(explorer).getByText("Explorer")).toBeInTheDocument();
    expect(within(explorer).getByText("Project records")).toBeInTheDocument();
    expect(within(explorer).getByText("Task 2 · 1 complete")).toBeInTheDocument();
    expect(within(explorer).getByText("Wireframe 1")).toBeInTheDocument();
  });

  it("다른 tab을 왕복해도 이전 HTML preview를 CTA 클릭 전에 복원하지 않는다", () => {
    const wireframe = createWireframe({
      html: "<!doctype html><html><body>Wireframe preview state</body></html>",
      id: 30,
      title: "Preview state wireframe",
    });
    const asset = createAsset({
      html: "<!doctype html><html><body>Asset preview state</body></html>",
      id: 31,
      title: "Preview state asset",
    });
    const context = createProjectContext({
      assets: [asset],
      wireframes: [wireframe],
    });
    const projects = [createProjectSummary(context)];
    const { rerender } = render(
      <Dashboard
        activeRelation="wireframes"
        context={context}
        projects={projects}
        selectedArtifactId={wireframe.id}
        selectedTaskId={null}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Wireframe preview" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Wireframe preview: Preview state wireframe",
      }),
    ).toBeInTheDocument();

    rerender(
      <Dashboard
        activeRelation="assets"
        context={context}
        projects={projects}
        selectedArtifactId={asset.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.queryByRole("complementary", {
        name: "Wireframe preview: Preview state wireframe",
      }),
    ).not.toBeInTheDocument();

    rerender(
      <Dashboard
        activeRelation="wireframes"
        context={context}
        projects={projects}
        selectedArtifactId={wireframe.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.queryByRole("complementary", {
        name: "Wireframe preview: Preview state wireframe",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Wireframe preview" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Wireframe preview: Preview state wireframe",
      }),
    ).toBeInTheDocument();
  });

  it("Plan browser를 menu 아래에 렌더한다", () => {
    const completedTask = createTask({ id: 1, status: "COMPLETED" });
    const pendingTask = createTask({ id: 2, status: "PENDING" });
    const context = createProjectContext({
      plans: [createPlan({ id: 3, tasks: [completedTask, pendingTask] })],
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
        activeRelation="plans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const workspaceNavigation = screen.getByRole("navigation", {
      name: "Project artifacts",
    });
    const browser = screen.getByRole("region", {
      name: "Plan 1",
    });
    expect(
      workspaceNavigation.compareDocumentPosition(browser) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.queryByText("Artifact Pipeline")).not.toBeInTheDocument();
    expect(screen.queryByText("Recent Artifacts")).not.toBeInTheDocument();
  });

  it("Domain menu는 record browser 대신 project ERD를 렌더한다", () => {
    const domain = createArtifact({
      title: "Completed project domain",
      content: JSON.stringify({
        kind: "domain-erd",
        schemaVersion: 1,
        name: "Harness domain",
        entities: [
          {
            id: "project",
            name: "Project",
            fields: [
              {
                name: "id",
                type: "Int",
                nullable: false,
                primaryKey: true,
              },
            ],
          },
        ],
        relationships: [],
      }),
    });
    const context = createProjectContext({ domains: [domain] });

    render(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Domain model" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Harness domain ERD" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Select a record")).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Domain\s*1/ }),
    ).toHaveAttribute("aria-current", "page");
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArtifact,
  createAsset,
  createDesign,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createReview,
  createTask,
  createWireframe,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const routerReplace = vi.hoisted(() => vi.fn());
const originalInnerWidth = window.innerWidth;

function setWindowInnerWidth(width: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
    writable: true,
  });
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: routerReplace,
  }),
}));

function createWorkbenchFixture() {
  const completedTask = createTask({
    id: 20,
    planId: 10,
    status: "COMPLETED",
    title: "API boundary",
  });
  const pendingTask = createTask({
    id: 21,
    planId: 10,
    status: "PENDING",
    title: "Browser QA",
  });
  const otherPlanTask = createTask({
    id: 22,
    planId: 11,
    status: "PENDING",
    title: "Unrelated plan task",
  });
  const plan = createPlan({
    id: 10,
    tasks: [completedTask, pendingTask],
    title: "MCP-only document pipeline",
    version: 4,
  });
  const otherPlan = createPlan({
    id: 11,
    tasks: [otherPlanTask],
    title: "Previous delivery plan",
    version: 3,
  });
  const wireframe = createWireframe({
    id: 60,
    title: "Artifact workbench flow",
  });
  const asset = createAsset({
    id: 70,
    title: "Workbench interface tokens",
  });
  const design = createDesign({
    asset,
    assetId: asset.id,
    id: 80,
    title: "Workbench production UI",
    wireframe,
    wireframeId: wireframe.id,
  });
  const context = createProjectContext({
    architectures: [
      createArtifact({ id: 50, title: "Harness production" }),
    ],
    assets: [asset],
    designs: [design],
    domains: [
      createArtifact({ id: 40, title: "Harness domain snapshot" }),
    ],
    drafts: [
      createArtifact({ id: 30, title: "Dashboard information model" }),
    ],
    plans: [plan, otherPlan],
    reviews: [createReview({ id: 90, title: "MCP boundary review" })],
    repoPaths: [{ path: "/workspace/yusung-harness", repoType: "LOCAL" }],
    tasks: [completedTask, pendingTask, otherPlanTask],
    wireframes: [wireframe],
  });

  return {
    context,
    projects: [createProjectSummary(context)],
  };
}

function renderWorkbench() {
  const { context, projects } = createWorkbenchFixture();

  const rendered = render(
    <Dashboard
      activeRelation="plans"
      context={context}
      projects={projects}
      selectedArtifactId={null}
      selectedTaskId={null}
    />,
  );

  return { ...rendered, context, projects };
}

describe("Dashboard artifact workbench visual contract", () => {
  beforeEach(() => {
    routerReplace.mockClear();
    setWindowInnerWidth(1_600);
  });

  afterEach(() => {
    setWindowInnerWidth(originalInnerWidth);
  });

  it("58px topbar 아래 270px / fluid / 30% 세 pane을 동시에 조립한다", () => {
    renderWorkbench();

    const topbar = screen.getByRole("banner");
    const workspace = screen.getByRole("main");
    const treePane = screen.getByRole("complementary", {
      name: "Project artifact tree",
    });
    const recordsPane = screen.getByRole("listbox", {
      name: "Artifact records",
    });
    const detailTabs = screen.getByRole("tablist", {
      name: "Record details",
    });

    expect(topbar.parentElement).toHaveClass(
      "h-dvh",
      "grid",
      "grid-rows-[58px_minmax(0,1fr)]",
    );
    expect(workspace).toHaveClass(
      "min-h-0",
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
      "lg:grid",
      "lg:grid-cols-[270px_minmax(0,1fr)_var(--detail-pane-width)]",
    );
    expect(workspace.style.getPropertyValue("--detail-pane-width")).toBe(
      "30%",
    );
    expect(treePane).toBeInTheDocument();
    expect(recordsPane).toBeInTheDocument();
    expect(detailTabs).toBeInTheDocument();

    expect(within(topbar).getByText("Artifact Workbench")).toBeInTheDocument();
    expect(
      within(topbar).getByRole("searchbox", { name: /Search records/ }),
    ).toBeInTheDocument();
    expect(within(topbar).getByText(/LOCAL/)).toBeInTheDocument();
    expect(
      within(topbar).getByRole("navigation", { name: "Mobile panes" }),
    ).toBeInTheDocument();

    for (const column of ["Type", "Title", "Status", "Links"]) {
      expect(screen.getAllByText(column).length).toBeGreaterThan(0);
    }
  });

  it("1600px viewport에서 160px pointer drag를 10%p 변화로 환산하고 15~70%로 제한한다", () => {
    renderWorkbench();

    const separator = screen.getByRole("separator", {
      name: "Resize detail pane",
    });

    expect(separator).toHaveAttribute("aria-orientation", "vertical");
    expect(separator).toHaveAttribute("aria-valuemin", "15");
    expect(separator).toHaveAttribute("aria-valuemax", "70");
    expect(separator).toHaveAttribute("aria-valuenow", "30");
    expect(separator).toHaveAttribute(
      "aria-valuetext",
      "30 percent of viewport",
    );
    expect(separator).toHaveAttribute("tabindex", "0");

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 900,
      pointerId: 1,
    });
    fireEvent.pointerMove(separator, { clientX: 740, pointerId: 1 });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeCloseTo(40);

    fireEvent.pointerMove(separator, { clientX: 1_060, pointerId: 1 });
    expect(Number(separator.getAttribute("aria-valuenow"))).toBeCloseTo(20);
    fireEvent.pointerUp(separator, { clientX: 1_060, pointerId: 1 });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 1_000,
      pointerId: 2,
    });
    fireEvent.pointerMove(separator, { clientX: -10_000, pointerId: 2 });
    expect(separator).toHaveAttribute("aria-valuenow", "70");
    fireEvent.pointerUp(separator, { clientX: -10_000, pointerId: 2 });

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 0,
      pointerId: 3,
    });
    fireEvent.pointerMove(separator, { clientX: 10_000, pointerId: 3 });
    expect(separator).toHaveAttribute("aria-valuenow", "15");
    fireEvent.pointerUp(separator, { clientX: 10_000, pointerId: 3 });
  });

  it("viewport가 800px로 줄어도 detail pane 비율과 15~70 ARIA 범위를 유지한다", () => {
    renderWorkbench();

    const separator = screen.getByRole("separator", {
      name: "Resize detail pane",
    });
    const workspace = screen.getByRole("main");

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 900,
      pointerId: 4,
    });
    fireEvent.pointerMove(separator, { clientX: 740, pointerId: 4 });
    fireEvent.pointerUp(separator, { clientX: 740, pointerId: 4 });
    expect(separator).toHaveAttribute("aria-valuenow", "40");
    expect(workspace.style.getPropertyValue("--detail-pane-width")).toBe(
      "40%",
    );

    setWindowInnerWidth(800);
    fireEvent.resize(window);

    expect(separator).toHaveAttribute("aria-valuemin", "15");
    expect(separator).toHaveAttribute("aria-valuemax", "70");
    expect(separator).toHaveAttribute("aria-valuenow", "40");
    expect(workspace.style.getPropertyValue("--detail-pane-width")).toBe(
      "40%",
    );
  });

  it("detail pane separator를 ArrowLeft / ArrowRight로 키보드 조절한다", () => {
    renderWorkbench();

    const separator = screen.getByRole("separator", {
      name: "Resize detail pane",
    });
    const workspace = screen.getByRole("main");
    const initialWidth = Number(separator.getAttribute("aria-valuenow"));

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    const expandedWidth = Number(separator.getAttribute("aria-valuenow"));
    expect(expandedWidth).toBeGreaterThan(initialWidth);
    expect(workspace.style.getPropertyValue("--detail-pane-width")).toBe(
      `${expandedWidth}%`,
    );

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    const contractedWidth = Number(separator.getAttribute("aria-valuenow"));
    expect(contractedWidth).toBeLessThan(expandedWidth);
    expect(workspace.style.getPropertyValue("--detail-pane-width")).toBe(
      `${contractedWidth}%`,
    );
  });

  it("Explorer는 독립 Task 메뉴 없이 Plan 선택 범위의 Task만 표시하고 deep link를 유지한다", () => {
    const { context, projects, rerender } = renderWorkbench();

    const tree = screen.getByRole("navigation", { name: "Artifact types" });
    const records = screen.getByRole("listbox", { name: "Artifact records" });

    expect(
      within(tree).queryByRole("button", { name: /All records/ }),
    ).not.toBeInTheDocument();
    expect(
      within(tree).queryByRole("button", { name: /^Tasks/ }),
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
        within(tree).getByRole("button", { name: new RegExp(label) }),
      ).toBeInTheDocument();
    }

    expect(within(records).getAllByRole("option")).toHaveLength(2);
    expect(
      within(records).getByRole("option", {
        name: /MCP-only document pipeline/,
      }),
    ).toBeInTheDocument();
    expect(
      within(records).getByRole("option", { name: /Previous delivery plan/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      within(records).getByRole("option", {
        name: /MCP-only document pipeline/,
      }),
    );

    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=plans&id=10",
      { scroll: false },
    );
    rerender(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={projects}
        selectedArtifactId={10}
        selectedTaskId={null}
      />,
    );
    expect(within(records).getAllByRole("option")).toHaveLength(2);
    expect(
      within(records).getByRole("option", { name: /API boundary/ }),
    ).toBeInTheDocument();
    expect(
      within(records).getByRole("option", { name: /Browser QA/ }),
    ).toBeInTheDocument();
    expect(
      within(records).queryByRole("option", { name: /Unrelated plan task/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(records).getByRole("option", { name: /API boundary/ }),
    );
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=plans&id=10&taskId=20",
      { scroll: false },
    );
  });

  it("Cmd/Ctrl+K, Escape, relation/status filter로 현재 목록을 좁힌다", () => {
    const { context, projects, rerender } = renderWorkbench();

    const search = screen.getByRole("searchbox", { name: /Search records/ });
    const records = screen.getByRole("listbox", { name: "Artifact records" });

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(search).toHaveFocus();

    fireEvent.change(search, { target: { value: "Previous delivery" } });
    expect(within(records).getAllByRole("option")).toHaveLength(1);
    expect(
      within(records).getByRole("option", { name: /Previous delivery plan/ }),
    ).toBeInTheDocument();

    fireEvent.keyDown(search, { key: "Escape" });
    expect(search).toHaveValue("");
    expect(search).not.toHaveFocus();
    expect(within(records).getAllByRole("option")).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /Designs/ }));
    expect(screen.getByRole("button", { name: /Designs/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(records).getAllByRole("option")).toHaveLength(1);
    expect(
      within(records).getByRole("option", { name: /Workbench production UI/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Plans/ }));
    fireEvent.click(
      within(records).getByRole("option", {
        name: /MCP-only document pipeline/,
      }),
    );
    rerender(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={projects}
        selectedArtifactId={10}
        selectedTaskId={null}
      />,
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "Pending" },
    });
    expect(within(records).getAllByRole("option")).toHaveLength(1);
    expect(
      within(records).getByRole("option", { name: /Browser QA/ }),
    ).toBeInTheDocument();
  });

  it("record 선택과 Metadata / Relations / Preview inspector 전환을 유지한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    fireEvent.click(screen.getByRole("button", { name: /Designs/ }));
    const designRow = within(records).getByRole("option", {
      name: /Workbench production UI/,
    });

    fireEvent.click(designRow);
    expect(designRow).toHaveAttribute("aria-selected", "true");
    const detailPane = screen.getByRole("complementary", {
      name: "Workbench production UI",
    });
    expect(
      within(detailPane).getByRole("heading", {
        level: 2,
        name: "Workbench production UI",
      }),
    ).toBeInTheDocument();

    const tabs = screen.getByRole("tablist", { name: "Record details" });
    const metadataTab = within(tabs).getByRole("tab", { name: "Metadata" });
    const relationsTab = within(tabs).getByRole("tab", { name: "Relations" });
    const previewTab = within(tabs).getByRole("tab", { name: "Preview" });

    expect(metadataTab).toHaveAttribute("aria-selected", "true");
    fireEvent.click(relationsTab);
    expect(relationsTab).toHaveAttribute("aria-selected", "true");
    const relationsPanel = screen.getByRole("tabpanel");
    expect(
      within(relationsPanel).getByText("Workbench interface tokens"),
    ).toBeInTheDocument();
    expect(
      within(relationsPanel).getByText("Artifact workbench flow"),
    ).toBeInTheDocument();

    fireEvent.click(previewTab);
    expect(previewTab).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("button", { name: /Open Design preview/ }),
    ).toBeInTheDocument();
  });

  it("mobile Tree / List / Info control이 단일 pane 상태를 전환한다", () => {
    renderWorkbench();

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile panes",
    });
    const treePane = screen.getByRole("complementary", {
      name: "Project artifact tree",
    });
    const recordsPane = screen.getByRole("region", { name: "Records" });
    const detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });

    expect(treePane).toHaveClass("hidden");
    expect(recordsPane).toHaveClass("flex");
    expect(detailPane).toHaveClass("hidden");

    fireEvent.click(
      within(mobileNavigation).getByRole("button", { name: "Open tree" }),
    );
    expect(treePane).toHaveClass("flex");
    expect(recordsPane).toHaveClass("hidden");
    expect(detailPane).toHaveClass("hidden");

    fireEvent.click(
      within(mobileNavigation).getByRole("button", { name: "Open records" }),
    );
    expect(treePane).toHaveClass("hidden");
    expect(recordsPane).toHaveClass("flex");
    expect(detailPane).toHaveClass("hidden");

    fireEvent.click(
      within(mobileNavigation).getByRole("button", { name: "Open detail" }),
    );
    expect(treePane).toHaveClass("hidden");
    expect(recordsPane).toHaveClass("hidden");
    expect(detailPane).toHaveClass("flex");
  });
});

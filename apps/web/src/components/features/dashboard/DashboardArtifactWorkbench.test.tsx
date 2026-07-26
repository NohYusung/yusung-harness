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
    index: "1.1",
    title: "Artifact workbench flow",
  });
  const idTargetWireframe = createWireframe({
    id: 61,
    index: "1.3",
    title: "ID target wireframe",
  });
  const indexFallbackWireframe = createWireframe({
    id: 62,
    index: "1.2",
    title: "Index fallback wireframe",
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
    wireframes: [wireframe, idTargetWireframe, indexFallbackWireframe],
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

function renderPreviewNavigationWorkbench({
  includeTargetDesign = true,
  initialRelation = "designs",
}: {
  includeTargetDesign?: boolean;
  initialRelation?: "designs" | "wireframes";
} = {}) {
  const sourceWireframe = createWireframe({
    html: '<!doctype html><html><body><a data-wireframe-index="1.2" href="./target.html">Target</a></body></html>',
    id: 160,
    index: "1.1",
    title: "Source wireframe",
  });
  const targetWireframe = createWireframe({
    id: 161,
    index: "1.2",
    title: "Target wireframe",
  });
  const asset = createAsset({ id: 170, title: "Shared design asset" });
  const sourceDesign = createDesign({
    asset,
    assetId: asset.id,
    html: '<!doctype html><html><body><a data-wireframe-index="1.2" href="./target.html">Target</a></body></html>',
    id: 180,
    title: "Source design",
    wireframe: sourceWireframe,
    wireframeId: sourceWireframe.id,
  });
  const targetDesign = createDesign({
    asset,
    assetId: asset.id,
    id: 181,
    title: "Target sibling design",
    wireframe: targetWireframe,
    wireframeId: targetWireframe.id,
  });
  const context = createProjectContext({
    assets: [asset],
    designs: includeTargetDesign
      ? [sourceDesign, targetDesign]
      : [sourceDesign],
    wireframes: [sourceWireframe, targetWireframe],
  });
  const projects = [createProjectSummary(context)];
  const selectedArtifactId =
    initialRelation === "designs" ? sourceDesign.id : sourceWireframe.id;
  const rendered = render(
    <Dashboard
      activeRelation={initialRelation}
      context={context}
      projects={projects}
      selectedArtifactId={selectedArtifactId}
      selectedTaskId={null}
    />,
  );

  return {
    ...rendered,
    sourceDesign,
    sourceWireframe,
    targetDesign,
    targetWireframe,
  };
}

function getMetadataContent(detailPane: HTMLElement): HTMLElement {
  const metadataLabel = within(detailPane).getByText("Record metadata");
  const metadataContent = metadataLabel.parentElement;

  if (!metadataContent) {
    throw new Error("Record metadata content container is missing");
  }

  return metadataContent;
}

function dispatchPreviewScroll(
  previewFrame: HTMLIFrameElement,
  scrollTop: number,
) {
  fireEvent(
    window,
    new MessageEvent("message", {
      data: {
        type: "YUSUNG_HARNESS_HTML_PREVIEW_SCROLL",
        scrollTop,
      },
      source: previewFrame.contentWindow,
    }),
  );
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
    const detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
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
    expect(detailPane).toBeInTheDocument();

    expect(within(topbar).getByText("Yusung Harness")).toBeInTheDocument();
    expect(within(topbar).queryByText("YH")).not.toBeInTheDocument();
    expect(
      within(topbar).queryByText("Artifact Workbench"),
    ).not.toBeInTheDocument();
    expect(
      within(topbar).getByRole("searchbox", { name: /Search records/ }),
    ).toBeInTheDocument();
    expect(
      within(topbar).queryByText("Yusung Harness · LOCAL"),
    ).not.toBeInTheDocument();
    expect(
      within(topbar).getByRole("navigation", { name: "Mobile panes" }),
    ).toBeInTheDocument();

    const recordsHeader = recordsPane.previousElementSibling;
    if (!(recordsHeader instanceof HTMLElement)) {
      throw new Error("Artifact records column header is missing");
    }

    const headerColumns = Array.from(recordsHeader.children);
    expect(headerColumns.map((column) => column.textContent)).toEqual([
      "Type",
      "No",
      "Title",
      "Status",
      "Links",
      "Updated",
    ]);
    for (const column of headerColumns) {
      expect(column).not.toHaveClass("max-lg:hidden");
    }
    expect(recordsHeader.parentElement).toHaveClass("overflow-auto");
    expect(recordsHeader).toHaveClass("min-w-[740px]");

    const currentPlanRow = within(recordsPane).getByRole("option", {
      name: /MCP-only document pipeline/,
    });
    expect(currentPlanRow).toHaveAccessibleName(
      "Type Plan, No 10, Title MCP-only document pipeline, Status Current, Links 2, Updated 2026년 7월 18일 오전 11:00",
    );
    const rowColumns = Array.from(currentPlanRow.children);
    expect(rowColumns).toHaveLength(6);
    expect(currentPlanRow).toHaveClass("min-w-[740px]");
    expect(rowColumns[0]).toHaveTextContent(/^Plan$/);
    expect(rowColumns[1]).toHaveTextContent(/^10$/);
    expect(rowColumns[2]).toHaveTextContent(/MCP-only document pipeline/);
    expect(rowColumns[2]?.querySelector("small")).toHaveTextContent(
      "v4 · 1/2 Tasks complete",
    );
    expect(rowColumns[3]).toHaveTextContent(/^Current$/);
    expect(rowColumns[4]).toHaveTextContent(/^2$/);
    expect(rowColumns[5]).toHaveTextContent(
      /^2026년 7월 18일 오전 11:00$/,
    );
    for (const column of rowColumns) {
      expect(column).not.toHaveClass("max-lg:hidden");
    }

    fireEvent.click(screen.getByRole("button", { name: /Drafts/ }));
    const draftRow = within(recordsPane).getByRole("option", {
      name: /Dashboard information model/,
    });
    const draftColumns = Array.from(draftRow.children);
    expect(draftColumns[1]).toHaveTextContent(/^30$/);
    expect(draftColumns[2]).toHaveTextContent(/^Dashboard information model$/);
    expect(draftColumns[2]?.querySelector("small")).toBeNull();
    expect(draftColumns[5]).toHaveTextContent(
      /^2026년 7월 18일 오전 11:00$/,
    );
  });

  it("desktop detail pane을 닫아 Records를 확장하고 같은 또는 다른 record 선택으로 다시 연다", () => {
    renderWorkbench();

    const workspace = screen.getByRole("main");
    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const selectedRow = within(records).getByRole("option", {
      name: /MCP-only document pipeline/,
    });
    const otherRow = within(records).getByRole("option", {
      name: /Previous delivery plan/,
    });
    let detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });
    let closeButton = within(detailPane).getByRole("button", {
      name: "Close detail pane",
    });

    expect(closeButton).toHaveClass("size-11");
    fireEvent.click(closeButton);

    expect(detailPane).toHaveClass("hidden");
    expect(workspace).toHaveClass(
      "md:grid-cols-[230px_minmax(0,1fr)]",
      "lg:grid-cols-[270px_minmax(0,1fr)]",
    );
    expect(workspace).not.toHaveClass(
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
      "lg:grid-cols-[270px_minmax(0,1fr)_var(--detail-pane-width)]",
    );
    expect(selectedRow).toHaveAttribute("aria-selected", "true");

    fireEvent.click(selectedRow);
    expect(detailPane).not.toHaveClass("hidden");
    expect(workspace).toHaveClass(
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
      "lg:grid-cols-[270px_minmax(0,1fr)_var(--detail-pane-width)]",
    );

    closeButton = within(detailPane).getByRole("button", {
      name: "Close detail pane",
    });
    fireEvent.click(closeButton);
    fireEvent.click(otherRow);

    detailPane = screen.getByRole("complementary", {
      name: "Previous delivery plan",
    });
    expect(detailPane).not.toHaveClass("hidden");
    expect(otherRow).toHaveAttribute("aria-selected", "true");
    expect(workspace).toHaveClass(
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
      "lg:grid-cols-[270px_minmax(0,1fr)_var(--detail-pane-width)]",
    );
  });

  it("모든 record Inspector에서 탭 UI 없이 Metadata 콘텐츠를 직접 제공한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const cases = [
      {
        contentTitle: null,
        relationName: /Drafts/,
        rowName: /Dashboard information model/,
        typeLabel: "Draft",
      },
      {
        contentTitle: "Artifact workbench flow HTML preview",
        relationName: /Wireframes/,
        rowName: /Artifact workbench flow/,
        typeLabel: "Wireframe",
      },
      {
        contentTitle: "Workbench interface tokens HTML preview",
        relationName: /Assets/,
        rowName: /Workbench interface tokens/,
        typeLabel: "Asset",
      },
      {
        contentTitle: "Workbench production UI HTML preview",
        relationName: /Designs/,
        rowName: /Workbench production UI/,
        typeLabel: "Design",
      },
    ];

    for (const testCase of cases) {
      fireEvent.click(
        screen.getByRole("button", { name: testCase.relationName }),
      );
      fireEvent.click(
        within(records).getByRole("option", { name: testCase.rowName }),
      );

      const detailPane = screen.getByRole("complementary", {
        name: testCase.rowName,
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

      const metadataContent = getMetadataContent(detailPane);
      expect(
        within(metadataContent).getByText("Type", { selector: "dt" }),
      ).toBeInTheDocument();
      expect(
        within(metadataContent).getByText(testCase.typeLabel, {
          selector: "dd",
        }),
      ).toBeInTheDocument();
      expect(metadataContent.querySelector("dl")).not.toBeNull();

      if (testCase.contentTitle) {
        expect(
          within(metadataContent).getByTitle(testCase.contentTitle),
        ).toBeInTheDocument();
      } else {
        expect(
          within(metadataContent).getByText("Record content"),
        ).toBeInTheDocument();
      }

      expect(document.querySelector("#preview-panel")).toBeNull();
      expect(document.querySelector("#relations-panel")).toBeNull();
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

  it("preview navigation은 source를 검증해 wireframe id를 우선하고 index로 fallback한다", () => {
    renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    fireEvent.click(
      screen.getByRole("option", { name: /Artifact workbench flow/ }),
    );

    const initialPreview = screen.getByTitle(
      "Artifact workbench flow HTML preview",
    ) as HTMLIFrameElement;
    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
          wireframeId: "61",
          wireframeIndex: "1.2",
        },
        source: initialPreview.contentWindow,
      }),
    );

    expect(
      screen.getByRole("complementary", { name: "ID target wireframe" }),
    ).toBeInTheDocument();
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=wireframes&id=61",
      { scroll: false },
    );

    const idTargetPreview = screen.getByTitle(
      "ID target wireframe HTML preview",
    ) as HTMLIFrameElement;
    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
          wireframeId: "999",
          wireframeIndex: "1.2",
        },
        source: idTargetPreview.contentWindow,
      }),
    );

    expect(
      screen.getByRole("complementary", {
        name: "Index fallback wireframe",
      }),
    ).toBeInTheDocument();
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=wireframes&id=62",
      { scroll: false },
    );
  });

  it("Design의 상대 HTML navigation은 같은 Asset의 대상 Wireframe Design을 선택한다", () => {
    const { sourceDesign, targetDesign, targetWireframe } =
      renderPreviewNavigationWorkbench();
    const sourcePreview = screen.getByTitle(
      `${sourceDesign.title} HTML preview`,
    ) as HTMLIFrameElement;

    expect(sourcePreview).toHaveAttribute(
      "srcdoc",
      expect.stringContaining(
        `data-wireframe-index="${targetWireframe.index}"`,
      ),
    );
    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
          wireframeIndex: targetWireframe.index,
        },
        source: sourcePreview.contentWindow,
      }),
    );

    expect(
      screen.getByRole("complementary", { name: targetDesign.title }),
    ).toBeInTheDocument();
    expect(routerReplace).toHaveBeenLastCalledWith(
      `/projects/1?type=designs&id=${targetDesign.id}`,
      { scroll: false },
    );
  });

  it("Wireframe의 상대 HTML navigation은 기존 대상 Wireframe 선택을 유지한다", () => {
    const { sourceWireframe, targetWireframe } =
      renderPreviewNavigationWorkbench({ initialRelation: "wireframes" });
    const sourcePreview = screen.getByTitle(
      `${sourceWireframe.title} HTML preview`,
    ) as HTMLIFrameElement;

    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
          wireframeIndex: targetWireframe.index,
        },
        source: sourcePreview.contentWindow,
      }),
    );

    expect(
      screen.getByRole("complementary", { name: targetWireframe.title }),
    ).toBeInTheDocument();
    expect(routerReplace).toHaveBeenLastCalledWith(
      `/projects/1?type=wireframes&id=${targetWireframe.id}`,
      { scroll: false },
    );
  });

  it("대상 Wireframe의 형제 Design이 없으면 현재 Design과 URL을 유지한다", () => {
    const { sourceDesign, targetWireframe } = renderPreviewNavigationWorkbench({
      includeTargetDesign: false,
    });
    const sourcePreview = screen.getByTitle(
      `${sourceDesign.title} HTML preview`,
    ) as HTMLIFrameElement;

    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
          wireframeIndex: targetWireframe.index,
        },
        source: sourcePreview.contentWindow,
      }),
    );

    expect(
      screen.getByRole("complementary", { name: sourceDesign.title }),
    ).toBeInTheDocument();
    expect(routerReplace).not.toHaveBeenCalled();
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

  it("record 선택 시 Metadata inspector 콘텐츠를 유지한다", () => {
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

    const metadataContent = getMetadataContent(detailPane);
    expect(
      within(metadataContent).getByTitle(
        "Workbench production UI HTML preview",
      ),
    ).toHaveAttribute("srcdoc", expect.stringContaining("Production design"));
    expect(
      within(detailPane).getByText("Record metadata"),
    ).toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("tablist", { name: "Record details" }),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("tab"),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("tabpanel"),
    ).not.toBeInTheDocument();
    expect(document.querySelector("#relations-panel")).toBeNull();
  });

  it("HTML preview scroll 상태에 따라 Metadata를 접고 preview 영역을 확장·복원한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    fireEvent.click(screen.getByRole("button", { name: /Designs/ }));
    fireEvent.click(
      within(records).getByRole("option", {
        name: /Workbench production UI/,
      }),
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Workbench production UI",
    });
    const recordDetails = within(detailPane).getByRole("region", {
      name: "Record details",
    });
    const metadataWrapper = recordDetails.querySelector<HTMLElement>(
      "[data-record-metadata]",
    );
    const previewRegion = recordDetails.querySelector<HTMLElement>(
      "[data-record-preview]",
    );
    const previewFrame = within(recordDetails).getByTitle(
      "Workbench production UI HTML preview",
    ) as HTMLIFrameElement;

    expect(metadataWrapper).not.toBeNull();
    expect(previewRegion).not.toBeNull();
    expect(recordDetails).toHaveClass("grid", "h-full", "min-h-0");

    dispatchPreviewScroll(previewFrame, 160);

    expect(recordDetails).toHaveAttribute("data-metadata-collapsed", "true");
    expect(metadataWrapper).toHaveAttribute("aria-hidden", "true");
    expect(metadataWrapper).toHaveClass("max-h-0", "overflow-hidden");
    expect(previewRegion).toHaveAttribute("data-preview-expanded", "true");
    expect(previewRegion).toHaveClass("h-full", "min-h-0");

    dispatchPreviewScroll(previewFrame, 0);

    expect(recordDetails).toHaveAttribute("data-metadata-collapsed", "false");
    expect(metadataWrapper).toHaveAttribute("aria-hidden", "false");
    expect(metadataWrapper).not.toHaveClass("max-h-0");
    expect(previewRegion).toHaveAttribute("data-preview-expanded", "false");
  });

  it("다른 HTML record를 선택하면 Metadata 접힘 상태를 초기화한다", () => {
    const { sourceDesign, targetDesign } = renderPreviewNavigationWorkbench();
    const sourcePreview = screen.getByTitle(
      `${sourceDesign.title} HTML preview`,
    ) as HTMLIFrameElement;

    dispatchPreviewScroll(sourcePreview, 160);

    let detailPane = screen.getByRole("complementary", {
      name: sourceDesign.title,
    });
    expect(
      within(detailPane).getByRole("region", { name: "Record details" }),
    ).toHaveAttribute("data-metadata-collapsed", "true");

    fireEvent.click(
      screen.getByRole("option", {
        name: new RegExp(targetDesign.title, "i"),
      }),
    );

    detailPane = screen.getByRole("complementary", {
      name: targetDesign.title,
    });
    const nextRecordDetails = within(detailPane).getByRole("region", {
      name: "Record details",
    });
    const nextMetadataWrapper = nextRecordDetails.querySelector(
      "[data-record-metadata]",
    );
    const nextPreviewRegion = nextRecordDetails.querySelector(
      "[data-record-preview]",
    );

    expect(nextRecordDetails).toHaveAttribute(
      "data-metadata-collapsed",
      "false",
    );
    expect(nextMetadataWrapper).toHaveAttribute("aria-hidden", "false");
    expect(nextPreviewRegion).toHaveAttribute(
      "data-preview-expanded",
      "false",
    );
  });

  it("Design Metadata에 연결된 Asset ID와 Wireframe ID만 표시한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    fireEvent.click(screen.getByRole("button", { name: /Designs/ }));
    fireEvent.click(
      within(records).getByRole("option", {
        name: /Workbench production UI/,
      }),
    );

    let detailPane = screen.getByRole("complementary", {
      name: "Workbench production UI",
    });
    let metadataContent = getMetadataContent(detailPane);
    const assetIdLabel = within(metadataContent).getByText("Asset ID", {
      selector: "dt",
    });
    const wireframeIdLabel = within(metadataContent).getByText(
      "Wireframe ID",
      { selector: "dt" },
    );

    expect(assetIdLabel.nextElementSibling).toHaveTextContent(/^70$/);
    expect(wireframeIdLabel.nextElementSibling).toHaveTextContent(/^60$/);

    fireEvent.click(screen.getByRole("button", { name: /Assets/ }));
    fireEvent.click(
      within(records).getByRole("option", {
        name: /Workbench interface tokens/,
      }),
    );

    detailPane = screen.getByRole("complementary", {
      name: "Workbench interface tokens",
    });
    metadataContent = getMetadataContent(detailPane);
    expect(
      within(metadataContent).queryByText("Asset ID", { selector: "dt" }),
    ).not.toBeInTheDocument();
    expect(
      within(metadataContent).queryByText("Wireframe ID", {
        selector: "dt",
      }),
    ).not.toBeInTheDocument();
  });

  it.each([
    {
      activeRelation: "wireframes" as const,
      buildContext: () => {
        const record = createWireframe({
          html: "<!doctype html><html><head></head><body>Metadata wireframe marker</body></html>",
          id: 61,
          title: "Metadata wireframe",
        });
        return {
          context: createProjectContext({ wireframes: [record] }),
          record,
        };
      },
      kind: "Wireframe",
      marker: "Metadata wireframe marker",
    },
    {
      activeRelation: "assets" as const,
      buildContext: () => {
        const record = createAsset({
          html: "<!doctype html><html><head></head><body>Metadata asset marker</body></html>",
          id: 71,
          title: "Metadata asset",
        });
        return {
          context: createProjectContext({ assets: [record] }),
          record,
        };
      },
      kind: "Asset",
      marker: "Metadata asset marker",
    },
    {
      activeRelation: "designs" as const,
      buildContext: () => {
        const record = createDesign({
          html: "<!doctype html><html><head></head><body>Metadata design marker</body></html>",
          id: 81,
          title: "Metadata design",
        });
        return {
          context: createProjectContext({ designs: [record] }),
          record,
        };
      },
      kind: "Design",
      marker: "Metadata design marker",
    },
  ])(
    "$kind Metadata에 record HTML iframe을 즉시 렌더한다",
    ({ activeRelation, buildContext, marker }) => {
      const { context, record } = buildContext();

      render(
        <Dashboard
          activeRelation={activeRelation}
          context={context}
          projects={[createProjectSummary(context)]}
          selectedArtifactId={record.id}
          selectedTaskId={null}
        />,
      );

      const detailPane = screen.getByRole("complementary", {
        name: record.title,
      });
      const metadataContent = getMetadataContent(detailPane);
      const previewFrame = within(metadataContent).getByTitle(
        `${record.title} HTML preview`,
      );
      expect(previewFrame).toHaveAttribute(
        "srcdoc",
        expect.stringContaining(marker),
      );
      expect(previewFrame).toHaveAttribute(
        "srcdoc",
        expect.stringContaining("Content-Security-Policy"),
      );

      const metadataList = metadataContent.querySelector("dl");
      expect(metadataList).not.toBeNull();
      expect(
        (metadataList?.compareDocumentPosition(previewFrame) ?? 0) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(within(detailPane).getAllByText(record.title)).toHaveLength(1);
      expect(
        within(metadataContent).queryByText(
          /Open the isolated HTML preview to inspect this generated interface artifact/i,
        ),
      ).not.toBeInTheDocument();
    },
  );

  it.each([
    {
      activeRelation: "wireframes" as const,
      buildContext: () => {
        const record = createWireframe({
          id: 631,
          index: "3.1",
          title: "Indexed wireframe",
        });
        return {
          context: createProjectContext({ wireframes: [record] }),
          record,
        };
      },
      expectedIndex: "3.1",
      kind: "Wireframe",
    },
    {
      activeRelation: "assets" as const,
      buildContext: () => {
        const record = createAsset({ id: 632, title: "Unindexed asset" });
        return {
          context: createProjectContext({ assets: [record] }),
          record,
        };
      },
      expectedIndex: null,
      kind: "Asset",
    },
    {
      activeRelation: "designs" as const,
      buildContext: () => {
        const record = createDesign({ id: 633, title: "Unindexed design" });
        return {
          context: createProjectContext({ designs: [record] }),
          record,
        };
      },
      expectedIndex: null,
      kind: "Design",
    },
  ])(
    "$kind Metadata의 Index 행을 record type에 맞게 표시한다",
    ({ activeRelation, buildContext, expectedIndex }) => {
      const { context, record } = buildContext();

      render(
        <Dashboard
          activeRelation={activeRelation}
          context={context}
          projects={[createProjectSummary(context)]}
          selectedArtifactId={record.id}
          selectedTaskId={null}
        />,
      );

      const detailPane = screen.getByRole("complementary", {
        name: record.title,
      });
      const metadataContent = getMetadataContent(detailPane);

      if (expectedIndex) {
        expect(
          within(metadataContent).getByText("Index", { selector: "dt" }),
        ).toBeInTheDocument();
        expect(
          within(metadataContent).getByText(expectedIndex, { selector: "dd" }),
        ).toBeInTheDocument();
      } else {
        expect(
          within(metadataContent).queryByText("Index", { selector: "dt" }),
        ).not.toBeInTheDocument();
      }
    },
  );

  it("Wireframe records는 parent 다음 child 순서와 title 전용 hierarchy 표식을 제공한다", () => {
    const parentWireframe = createWireframe({
      id: 630,
      index: "3",
      parentId: null,
      title: "Portfolio overview",
    });
    const childWireframe = createWireframe({
      id: 631,
      index: "3.1",
      parentId: parentWireframe.id,
      title: "Case study detail",
    });
    const asset = createAsset({ id: 632, title: "Hierarchy-free asset" });
    const design = createDesign({ id: 633, title: "Hierarchy-free design" });
    const context = createProjectContext({
      assets: [asset],
      designs: [design],
      wireframes: [parentWireframe, childWireframe],
    });

    render(
      <Dashboard
        activeRelation="wireframes"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const parentRow = within(records).getByRole("option", {
      name: /Portfolio overview/,
    });
    const childRow = within(records).getByRole("option", {
      name: /Case study detail/,
    });
    expect(childRow).toHaveAccessibleName(
      "Type Wireframe, No 631, Title Case study detail, Status None, Links 0, Updated 2026년 7월 18일 오전 11:00",
    );
    expect(childRow).toHaveAttribute(
      "aria-describedby",
      `wireframe-parent-${childWireframe.id}`,
    );

    expect(
      parentRow.compareDocumentPosition(childRow) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const parentTitleRegion = within(parentRow)
      .getByText(parentWireframe.title)
      .closest<HTMLElement>("[data-wireframe-depth]");
    const childTitleRegion = within(childRow)
      .getByText(childWireframe.title)
      .closest<HTMLElement>("[data-wireframe-depth]");

    expect(parentTitleRegion).toHaveAttribute("data-wireframe-depth", "0");
    expect(childTitleRegion).toHaveAttribute("data-wireframe-depth", "1");
    expect(parentRow).not.toHaveAttribute("data-wireframe-depth");
    expect(childRow).not.toHaveAttribute("data-wireframe-depth");
    expect(
      parentTitleRegion?.querySelector("[data-wireframe-branch]"),
    ).toBeNull();

    const branchMarker = childTitleRegion?.querySelector(
      "[data-wireframe-branch]",
    );
    expect(branchMarker).toHaveAttribute("aria-hidden", "true");
    const parentRelation = within(childTitleRegion as HTMLElement).getByText(
      `Parent wireframe: ${parentWireframe.title}`,
    );
    expect(parentRelation).toHaveClass("sr-only");

    for (const testCase of [
      { relation: /Assets/, record: asset },
      { relation: /Designs/, record: design },
    ]) {
      fireEvent.click(screen.getByRole("button", { name: testCase.relation }));
      const row = within(records).getByRole("option", {
        name: new RegExp(testCase.record.title),
      });

      expect(row.querySelector("[data-wireframe-depth]")).toBeNull();
      expect(row.querySelector("[data-wireframe-branch]")).toBeNull();
      expect(
        within(row).queryByText(/Parent wireframe:/),
      ).not.toBeInTheDocument();
    }
  });

  it("Wireframe 상세 영역에 선택 record의 HTML을 iframe으로 즉시 렌더한다", () => {
    const firstWireframe = createWireframe({
      html: "<!doctype html><html><head></head><body>First wireframe</body></html>",
      id: 60,
      title: "First wireframe",
    });
    const selectedWireframe = createWireframe({
      html: "<!doctype html><html><head></head><body><main>Selected wireframe marker</main></body></html>",
      id: 61,
      title: "Selected inline wireframe",
    });
    const context = createProjectContext({
      wireframes: [firstWireframe, selectedWireframe],
    });

    render(
      <Dashboard
        activeRelation="wireframes"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    fireEvent.click(
      within(records).getByRole("option", {
        name: /Selected inline wireframe/,
      }),
    );
    const detailPane = screen.getByRole("complementary", {
      name: "Selected inline wireframe",
    });
    const metadataContent = getMetadataContent(detailPane);
    const previewFrame = within(metadataContent).getByTitle(
      "Selected inline wireframe HTML preview",
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Selected wireframe marker"),
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-Security-Policy"),
    );
    expect(
      within(metadataContent).queryByRole("button", {
        name: /Open Wireframe preview/,
      }),
    ).not.toBeInTheDocument();
    expect(
      within(metadataContent).queryByText("Open isolated preview"),
    ).not.toBeInTheDocument();
    expect(
      within(metadataContent).queryByText("Artifact Workbench"),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("tab"),
    ).not.toBeInTheDocument();
  });

  it("Asset과 Design도 Metadata의 inline HTML iframe 경로를 사용한다", () => {
    const asset = createAsset({
      html: "<!doctype html><html><head></head><body>Inline asset marker</body></html>",
      id: 70,
      title: "Inline asset",
    });
    const design = createDesign({
      html: "<!doctype html><html><head></head><body>Inline design marker</body></html>",
      id: 80,
      title: "Inline design",
    });
    const context = createProjectContext({
      assets: [asset],
      designs: [design],
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

    let detailPane = screen.getByRole("complementary", {
      name: "Inline asset",
    });
    expect(
      within(detailPane).getByTitle("Inline asset HTML preview"),
    ).toHaveAttribute("srcdoc", expect.stringContaining("Inline asset marker"));

    fireEvent.click(screen.getByRole("button", { name: /Designs/ }));
    const records = screen.getByRole("listbox", { name: "Artifact records" });
    fireEvent.click(
      within(records).getByRole("option", { name: /Inline design/ }),
    );
    detailPane = screen.getByRole("complementary", {
      name: "Inline design",
    });
    expect(
      within(detailPane).getByTitle("Inline design HTML preview"),
    ).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Inline design marker"),
    );
    expect(
      within(detailPane).queryByRole("tab"),
    ).not.toBeInTheDocument();
  });

  it("status 필드가 없는 Draft의 Metadata에 Status 행을 렌더하지 않는다", () => {
    const { context } = createWorkbenchFixture();
    const draft = createArtifact({
      id: 30,
      title: "Dashboard information model",
    });
    const projectContext = { ...context, drafts: [draft] };

    render(
      <Dashboard
        activeRelation="drafts"
        context={projectContext}
        projects={[createProjectSummary(projectContext)]}
        selectedArtifactId={draft.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: draft.title,
    });
    expect(
      within(detailPane).queryByText("Status", { selector: "dt" }),
    ).not.toBeInTheDocument();
  });

  it("status 필드가 없는 record 목록에 하드코딩 상태를 표시하지 않는다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const cases = [
      {
        relationName: /Drafts/,
        rowName: /Dashboard information model/,
        status: "Draft",
        typeLabelOccurrences: 1,
      },
      {
        relationName: /Domain/,
        rowName: /Harness domain snapshot/,
        status: "Snapshot",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Architecture/,
        rowName: /Harness production/,
        status: "Snapshot",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Wireframes/,
        rowName: /Artifact workbench flow/,
        status: "HTML",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Assets/,
        rowName: /Workbench interface tokens/,
        status: "HTML",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Designs/,
        rowName: /Workbench production UI/,
        status: "HTML",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Reviews/,
        rowName: /MCP boundary review/,
        status: "Completed",
        typeLabelOccurrences: 0,
      },
    ];

    for (const testCase of cases) {
      fireEvent.click(
        screen.getByRole("button", { name: testCase.relationName }),
      );
      const row = within(records).getByRole("option", {
        name: testCase.rowName,
      });

      expect(within(row).queryAllByText(testCase.status)).toHaveLength(
        testCase.typeLabelOccurrences,
      );
      expect(within(row).queryByText("Document")).not.toBeInTheDocument();
    }
  });

  it("detail header에 Copy deep link 버튼을 렌더하지 않는다", () => {
    renderWorkbench();

    const detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });

    expect(
      within(detailPane).queryByRole("button", { name: "Copy deep link" }),
    ).not.toBeInTheDocument();
  });

  it("Draft 본문의 Markdown을 의미 요소로 렌더하고 raw HTML은 실행하지 않는다", () => {
    const { context } = createWorkbenchFixture();
    const draft = createArtifact({
      content: `# Rendered heading

## Evidence section

- First item
- **Important evidence** with \`inline code\` and [reference](https://example.com/reference).

<button id="unsafe-markup" onclick="window.__unsafeMarkdownExecuted = true">Unsafe button</button>
<script>window.__unsafeMarkdownExecuted = true</script>`,
      id: 30,
      title: "Structured Markdown draft",
    });
    const projectContext = { ...context, drafts: [draft] };

    const { container } = render(
      <Dashboard
        activeRelation="drafts"
        context={projectContext}
        projects={[createProjectSummary(projectContext)]}
        selectedArtifactId={draft.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Structured Markdown draft",
    });
    const metadataContent = getMetadataContent(detailPane);

    expect(
      within(metadataContent).getByText("Structured Markdown draft"),
    ).toBeInTheDocument();

    expect(
      within(metadataContent).getByRole("heading", {
        level: 1,
        name: "Rendered heading",
      }),
    ).toBeInTheDocument();
    expect(
      within(metadataContent).getByRole("heading", {
        level: 2,
        name: "Evidence section",
      }),
    ).toBeInTheDocument();

    const list = within(metadataContent).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);

    expect(within(metadataContent).getByText("Important evidence").tagName).toBe(
      "STRONG",
    );
    expect(within(metadataContent).getByText("inline code").tagName).toBe(
      "CODE",
    );
    expect(
      within(metadataContent).getByRole("link", { name: "reference" }),
    ).toHaveAttribute("href", "https://example.com/reference");

    expect(metadataContent).not.toHaveTextContent("# Rendered heading");
    expect(metadataContent).not.toHaveTextContent("## Evidence section");
    expect(metadataContent).not.toHaveTextContent("**Important evidence**");
    expect(metadataContent).not.toHaveTextContent("`inline code`");
    expect(container.querySelector("#unsafe-markup")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
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

  it("mobile detail pane을 닫으면 Records로 돌아가고 Info 또는 record 선택으로 다시 연다", () => {
    setWindowInnerWidth(390);
    fireEvent.resize(window);
    renderWorkbench();

    const mobileNavigation = screen.getByRole("navigation", {
      name: "Mobile panes",
    });
    const recordsPane = screen.getByRole("region", { name: "Records" });
    const records = within(recordsPane).getByRole("listbox", {
      name: "Artifact records",
    });
    const selectedRow = within(records).getByRole("option", {
      name: /MCP-only document pipeline/,
    });
    let detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });

    fireEvent.click(
      within(mobileNavigation).getByRole("button", { name: "Open detail" }),
    );
    fireEvent.click(
      within(detailPane).getByRole("button", { name: "Close detail pane" }),
    );

    expect(recordsPane).toHaveClass("flex");
    expect(detailPane).toHaveClass("hidden");
    expect(selectedRow).toHaveAttribute("aria-selected", "true");

    fireEvent.click(
      within(mobileNavigation).getByRole("button", { name: "Open detail" }),
    );
    expect(recordsPane).toHaveClass("hidden");
    expect(detailPane).toHaveClass("flex");

    fireEvent.click(
      within(detailPane).getByRole("button", { name: "Close detail pane" }),
    );
    fireEvent.click(selectedRow);

    detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });
    expect(recordsPane).toHaveClass("hidden");
    expect(detailPane).toHaveClass("flex");
    expect(selectedRow).toHaveAttribute("aria-selected", "true");
  });
});

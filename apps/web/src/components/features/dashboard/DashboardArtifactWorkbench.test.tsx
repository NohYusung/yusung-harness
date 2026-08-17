import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArtifact,
  createAsset,
  createDomain,
  createErd,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createReview,
  createTask,
  createWireframe,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const routerReplace = vi.hoisted(() => vi.fn());
const dineugMocks = vi.hoisted(() => ({
  render: vi.fn(),
}));
const originalInnerWidth = window.innerWidth;

function createDeploymentArchitectureContent({
  name,
  nodeName,
}: {
  name: string;
  nodeName: string;
}) {
  return JSON.stringify({
    kind: "deployment-architecture",
    schemaVersion: 1,
    name,
    environments: [
      { id: "production", name: "Production", kind: "cloud" },
    ],
    nodes: [
      {
        id: "api",
        name: nodeName,
        kind: "service",
        environmentId: "production",
      },
    ],
    connections: [],
  });
}

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

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockDineugCanvas(props: {
      document: unknown;
      recordId: number;
      title: string;
    }) {
      dineugMocks.render(props);
      return (
        <div
          aria-label={`${props.title} ERD preview`}
          data-testid="workbench-dineug"
          role="region"
        />
      );
    },
}));

vi.mock("@dineug/erd-editor", () => ({}));

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
    status: "IN_PROGRESS",
  });
  const otherPlan = createPlan({
    id: 11,
    tasks: [otherPlanTask],
    title: "Previous delivery plan",
    status: "PENDING",
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
  const context = createProjectContext({
    architectures: [
      {
        ...createArtifact({ id: 50, title: "Harness production" }),
        html: "",
        type: "PRODUCTION" as const,
      },
    ],
    assets: [asset],
    domains: [
      createDomain({ id: 40, title: "Harness business domain" }),
    ],
    research: [
      createArtifact({ id: 30, title: "Dashboard research evidence" }),
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

function getWorkbenchLayout() {
  const topbar = screen.getByRole("banner");
  const workspace = screen.getByRole("main");
  const viewportLayout = topbar.parentElement;

  if (!(viewportLayout instanceof HTMLElement)) {
    throw new Error("Dashboard viewport layout is missing");
  }

  return { topbar, viewportLayout, workspace };
}

function renderPreviewNavigationWorkbench() {
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
  const context = createProjectContext({
    wireframes: [sourceWireframe, targetWireframe],
  });
  const projects = [createProjectSummary(context)];
  const rendered = render(
    <Dashboard
      activeRelation="wireframes"
      context={context}
      projects={projects}
      selectedArtifactId={sourceWireframe.id}
      selectedTaskId={null}
    />,
  );

  return {
    ...rendered,
    sourceWireframe,
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

/** Wireframe의 기본 Dashboard viewport title을 일관되게 조회한다. */
function getDesktopHtmlPreviewTitle(title: string): string {
  return `${title} HTML preview · Desktop 1440 × 900`;
}

describe("Dashboard artifact workbench visual contract", () => {
  beforeEach(() => {
    routerReplace.mockClear();
    dineugMocks.render.mockReset();
    setWindowInnerWidth(1_600);
  });

  afterEach(() => {
    setWindowInnerWidth(originalInnerWidth);
  });

  it("선택한 valid Architecture만 graph로 렌더하고 canonical JSON 원문을 노출하지 않는다", () => {
    const selectedContent = createDeploymentArchitectureContent({
      name: "Selected architecture A",
      nodeName: "Selected API A",
    });
    const newerContent = createDeploymentArchitectureContent({
      name: "Newer architecture B",
      nodeName: "Newer API B",
    });
    const selectedArchitecture = {
      ...createArtifact({
        content: selectedContent,
        id: 501,
        title: "Selected production A",
        updatedAt: "2026-07-21T09:00:00.000Z",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const newerArchitecture = {
      ...createArtifact({
        content: newerContent,
        id: 502,
        title: "Newer production B",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const context = createProjectContext({
      architectures: [newerArchitecture, selectedArchitecture],
    });

    render(
      <Dashboard
        activeRelation="architectures"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={selectedArchitecture.id}
        selectedTaskId={null}
      />,
    );

    const selectedRow = screen.getByRole("option", {
      name: /Selected production A/,
    });
    const detailPane = screen.getByRole("complementary", {
      name: selectedArchitecture.title,
    });
    const graph = within(detailPane).getByRole("region", {
      name: "Selected architecture A deployment architecture",
    });

    expect(selectedRow).toHaveAttribute("aria-selected", "true");
    expect(within(graph).getByText("Selected API A")).toBeInTheDocument();
    expect(within(detailPane).queryByText("Newer API B")).not.toBeInTheDocument();
    expect(detailPane).not.toHaveTextContent('"kind":"deployment-architecture"');
    expect(detailPane.querySelector("pre")).toBeNull();
    expect(detailPane.querySelector("code")).toBeNull();
  });

  it("선택한 legacy Architecture를 newer valid graph로 대체하지 않고 원문 fallback으로 표시한다", () => {
    const legacyArchitecture = {
      ...createArtifact({
        content: "Legacy gateway -> worker -> database",
        id: 511,
        title: "Selected legacy A",
        updatedAt: "2026-07-21T09:00:00.000Z",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const newerArchitecture = {
      ...createArtifact({
        content: createDeploymentArchitectureContent({
          name: "Newer valid B",
          nodeName: "Newer valid API B",
        }),
        id: 512,
        title: "Newer valid architecture B",
        updatedAt: "2026-07-21T10:00:00.000Z",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const context = createProjectContext({
      architectures: [newerArchitecture, legacyArchitecture],
    });

    render(
      <Dashboard
        activeRelation="architectures"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={legacyArchitecture.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: legacyArchitecture.title,
    });
    const legacyAlert = within(detailPane).getByRole("alert");

    expect(legacyAlert).toHaveTextContent("Deployment graph unavailable");
    expect(legacyAlert).toHaveTextContent(legacyArchitecture.content);
    expect(
      within(detailPane).queryByRole("region", {
        name: "Newer valid B deployment architecture",
      }),
    ).not.toBeInTheDocument();
    expect(within(detailPane).queryByText("Newer valid API B")).not.toBeInTheDocument();
  });

  it("Architecture graph를 visual preview grid와 단일 내부 scroll owner에 배치한다", () => {
    const architecture = {
      ...createArtifact({
        content: createDeploymentArchitectureContent({
          name: "Bounded production graph",
          nodeName: "Bounded API",
        }),
        id: 521,
        title: "Bounded architecture",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const context = createProjectContext({ architectures: [architecture] });

    render(
      <Dashboard
        activeRelation="architectures"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={architecture.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: architecture.title,
    });
    const recordDetails = within(detailPane).getByRole("region", {
      name: "Record details",
    });
    const detailScrollBoundary = recordDetails.parentElement;
    const metadata = recordDetails.querySelector<HTMLElement>(
      "[data-record-metadata]",
    );
    const preview = recordDetails.querySelector<HTMLElement>(
      "[data-record-preview]",
    );
    const graph = within(recordDetails).getByRole("region", {
      name: "Bounded production graph deployment architecture",
    });
    const graphScrollOwner = graph.parentElement;

    expect(detailScrollBoundary).toHaveClass("overflow-hidden");
    expect(recordDetails).toHaveClass(
      "grid",
      "h-full",
      "min-h-0",
      "min-w-0",
      "grid-rows-[auto_auto_minmax(0,1fr)]",
    );
    expect(recordDetails).toHaveAttribute("data-metadata-collapsed", "false");
    expect(metadata).toHaveAttribute("aria-hidden", "false");
    expect(preview).not.toBeNull();
    expect(preview).toHaveClass(
      "h-full",
      "min-h-0",
      "min-w-0",
      "overflow-hidden",
    );
    expect(preview).toHaveAttribute("data-preview-expanded", "false");
    expect(graphScrollOwner).toHaveClass(
      "min-h-0",
      "flex-1",
      "overflow-y-auto",
    );
  });

  it("Architecture는 logical root 하나와 Plan Current 중앙 탭을 제공하고 Current를 우선한다", () => {
    const plan = {
      ...createArtifact({ id: 531, title: "Unified architecture plan" }),
      html: "<!doctype html><html><head><title>Plan</title></head><body><main>Unified plan diagram</main></body></html>",
      type: "PLAN" as const,
    };
    const production = {
      ...createArtifact({
        content: createDeploymentArchitectureContent({
          name: "Unified current architecture",
          nodeName: "Unified current API",
        }),
        id: 532,
        title: "Unified production snapshot",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const context = createProjectContext({
      architectures: [plan, production],
    });

    render(
      <Dashboard
        activeRelation="architectures"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("button", { name: /^Architecture\s*1$/ }),
    ).toBeInTheDocument();
    const records = screen.getByRole("region", { name: "Records" });
    const views = within(records).getByRole("tablist", {
      name: "Architecture views",
    });
    const planTab = within(views).getByRole("tab", { name: "Plan" });
    const currentTab = within(views).getByRole("tab", { name: "Current" });

    expect(currentTab).toHaveAttribute("aria-selected", "true");
    expect(planTab).toHaveAttribute("aria-selected", "false");
    expect(
      within(records).getByRole("option", {
        name: /Unified production snapshot/,
      }),
    ).toBeInTheDocument();
    expect(
      within(records).queryByRole("option", { name: /Unified architecture plan/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("region", {
        name: "Unified current architecture deployment architecture",
      }),
    ).toHaveTextContent("Unified current API");

    fireEvent.click(planTab);

    expect(planTab).toHaveAttribute("aria-selected", "true");
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=architectures&view=plan",
      { scroll: false },
    );
    expect(
      within(records).getByRole("option", { name: /Unified architecture plan/ }),
    ).toBeInTheDocument();
    expect(
      within(records).queryByRole("option", {
        name: /Unified production snapshot/,
      }),
    ).not.toBeInTheDocument();
  });

  it("Current가 없으면 Plan을 기본 선택하고 둘 다 없으면 Plan empty state를 표시한다", () => {
    const plan = {
      ...createArtifact({ id: 541, title: "Plan-only architecture" }),
      html: "",
      type: "PLAN" as const,
    };
    const planContext = createProjectContext({ architectures: [plan] });
    const { rerender } = render(
      <Dashboard
        activeRelation="architectures"
        context={planContext}
        projects={[createProjectSummary(planContext)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    let views = screen.getByRole("tablist", { name: "Architecture views" });
    expect(within(views).getByRole("tab", { name: "Plan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("option", { name: /Plan-only architecture/ }),
    ).toBeInTheDocument();

    const emptyContext = createProjectContext({ architectures: [] });
    rerender(
      <Dashboard
        activeRelation="architectures"
        context={emptyContext}
        projects={[createProjectSummary(emptyContext)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    views = screen.getByRole("tablist", { name: "Architecture views" });
    expect(within(views).getByRole("tab", { name: "Plan" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByText("No Architecture Plan records")).toBeInTheDocument();
  });

  it("명시한 Architecture view와 record type이 다르면 다른 record로 대체하지 않는다", () => {
    const plan = {
      ...createArtifact({ id: 551, title: "Explicit plan record" }),
      html: "",
      type: "PLAN" as const,
    };
    const production = {
      ...createArtifact({
        content: createDeploymentArchitectureContent({
          name: "Mismatched production",
          nodeName: "Must not render production API",
        }),
        id: 552,
        title: "Explicit current record",
      }),
      html: "",
      type: "PRODUCTION" as const,
    };
    const context = createProjectContext({
      architectures: [plan, production],
    });

    render(
      <Dashboard
        activeRelation="architectures"
        architectureView="plan"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={production.id}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("tab", { name: "Plan" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      screen.getByRole("complementary", { name: "Architecture not found" }),
    ).toHaveTextContent(`Architecture #${production.id}`);
    expect(
      screen.queryByText("Must not render production API"),
    ).not.toBeInTheDocument();
  });

  it("Wireframe preview는 Desktop이 기본이고 같은 iframe에서 Mobile viewport로 전환한다", () => {
    renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    fireEvent.click(
      screen.getByRole("option", { name: /Artifact workbench flow/ }),
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Artifact workbench flow",
    });
    const viewportControls = within(detailPane).getByRole("group", {
      name: "Preview viewport",
    });
    const desktopButton = within(viewportControls).getByRole("button", {
      name: "Desktop 1440 × 900",
    });
    const mobileButton = within(viewportControls).getByRole("button", {
      name: "Mobile 390 × 844",
    });
    const desktopPreview = within(detailPane).getByTitle(
      "Artifact workbench flow HTML preview · Desktop 1440 × 900",
    );
    const originalSrcDoc = desktopPreview.getAttribute("srcdoc");
    const previewCanvas = desktopPreview.closest("[data-preview-canvas]");

    expect(desktopButton).toHaveAttribute("aria-pressed", "true");
    expect(mobileButton).toHaveAttribute("aria-pressed", "false");
    expect(desktopPreview).toHaveStyle({ height: "900px", width: "1440px" });
    expect(previewCanvas).toHaveClass("min-w-0", "max-w-full", "overflow-auto");
    expect(previewCanvas).toHaveAttribute("aria-label", "Artifact workbench flow preview canvas");
    expect(previewCanvas).toHaveAttribute("role", "region");
    expect(previewCanvas).toHaveAttribute("tabindex", "0");
    expect(previewCanvas?.parentElement).toHaveClass(
      "w-full",
      "min-w-0",
      "max-w-full",
    );
    expect(previewCanvas?.closest("[data-record-preview]")).toHaveClass(
      "min-w-0",
    );

    if (!(previewCanvas instanceof HTMLElement)) {
      throw new Error("Preview viewport canvas is missing");
    }
    previewCanvas.scrollLeft = 120;
    previewCanvas.scrollTop = 80;
    fireEvent.click(mobileButton);

    const mobilePreview = within(detailPane).getByTitle(
      "Artifact workbench flow HTML preview · Mobile 390 × 844",
    );
    expect(mobilePreview).toBe(desktopPreview);
    expect(mobilePreview).toHaveAttribute("srcdoc", originalSrcDoc);
    expect(mobilePreview).toHaveStyle({ height: "844px", width: "390px" });
    expect(previewCanvas.scrollLeft).toBe(0);
    expect(previewCanvas.scrollTop).toBe(0);
  });

  it("선택 Wireframe record가 바뀌어도 preview viewport를 세션 동안 유지한다", () => {
    renderWorkbench();
    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    fireEvent.click(
      screen.getByRole("option", { name: /Artifact workbench flow/ }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Mobile 390 × 844" }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: /ID target wireframe/ }),
    );

    const detailPane = screen.getByRole("complementary", {
      name: "ID target wireframe",
    });
    expect(
      within(detailPane).getByRole("button", { name: "Mobile 390 × 844" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      within(detailPane).getByTitle(
        "ID target wireframe HTML preview · Mobile 390 × 844",
      ),
    ).toHaveStyle({ height: "844px", width: "390px" });

  });

  it.each([
    {
      activeRelation: "assets" as const,
      contextKey: "assets" as const,
      record: createAsset({ id: 301, title: "Viewport-free asset" }),
    },
    {
      activeRelation: "architectures" as const,
      contextKey: "architectures" as const,
      record: {
        ...createArtifact({
          id: 302,
          title: "Viewport-free architecture plan",
        }),
        html: "<!doctype html><html><head></head><body>Architecture diagram</body></html>",
        type: "PLAN" as const,
      },
    },
    {
      activeRelation: "erds" as const,
      contextKey: "erds" as const,
      record: createErd({ id: 303, title: "Viewport-free ERD" }),
    },
  ])(
    "$activeRelation preview에는 viewport 토글을 노출하지 않는다",
    ({ activeRelation, contextKey, record }) => {
      const context = createProjectContext({ [contextKey]: [record] });

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
      expect(
        within(detailPane).queryByRole("group", { name: "Preview viewport" }),
      ).not.toBeInTheDocument();
    },
  );

  it("ERD detail은 HTML iframe 대신 읽기 전용 Dineug renderer를 조립한다", async () => {
    const erd = createErd({ id: 304, title: "Dineug project ERD" });
    const context = createProjectContext({ erds: [erd] });
    const { container } = render(
      <Dashboard
        activeRelation="erds"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={erd.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: erd.title,
    });
    expect(
      await within(detailPane).findByRole("region", {
        name: "Dineug project ERD ERD preview",
      }),
    ).toBe(screen.getByTestId("workbench-dineug"));
    expect(
      within(detailPane).getByText("ERD", { selector: "dd" }),
    ).toBeInTheDocument();
    expect(
      within(detailPane).queryByTitle(/HTML preview/),
    ).not.toBeInTheDocument();
    expect(
      within(detailPane).queryByRole("group", { name: "Preview viewport" }),
    ).not.toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
  });

  it.each([
    [null, "Dineug ERD document is not available."],
    ["not-json", "Dineug ERD document is not valid JSON."],
  ] as const)(
    "ERD document %p 오류를 Workbench record 안에서 격리한다",
    async (document, message) => {
      const erd = createErd({
        document,
        id: 305,
        title: "Unavailable project ERD",
      });
      const context = createProjectContext({ erds: [erd] });
      const { container } = render(
        <Dashboard
          activeRelation="erds"
          context={context}
          projects={[createProjectSummary(context)]}
          selectedArtifactId={erd.id}
          selectedTaskId={null}
        />,
      );

      expect(
        await screen.findByRole("alert", {
          name: "Unavailable project ERD ERD preview error",
        }),
      ).toHaveTextContent(message);
      expect(container.querySelector("iframe")).toBeNull();
      expect(dineugMocks.render).not.toHaveBeenCalled();
    },
  );

  it("ERD id-updatedAt key가 바뀌면 Dineug renderer DOM을 remount한다", async () => {
    const erd = createErd({ id: 306, title: "Versioned ERD" });
    const context = createProjectContext({ erds: [erd] });
    const rendered = render(
      <Dashboard
        activeRelation="erds"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={erd.id}
        selectedTaskId={null}
      />,
    );
    const firstRenderer = await screen.findByTestId("workbench-dineug");
    const updatedErd = {
      ...erd,
      updatedAt: "2026-07-18T03:00:00.000Z",
    };
    const updatedContext = createProjectContext({ erds: [updatedErd] });

    rendered.rerender(
      <Dashboard
        activeRelation="erds"
        context={updatedContext}
        projects={[createProjectSummary(updatedContext)]}
        selectedArtifactId={updatedErd.id}
        selectedTaskId={null}
      />,
    );

    expect(await screen.findByTestId("workbench-dineug")).not.toBe(
      firstRenderer,
    );
  });

  it("전폭 header 아래 230px Explorer·Records·detail을 body grid로 조립한다", () => {
    renderWorkbench();

    const { topbar, viewportLayout, workspace } = getWorkbenchLayout();
    const treePane = screen.getByRole("complementary", {
      name: "Project artifact tree",
    });
    const recordsPane = screen.getByRole("listbox", {
      name: "Artifact records",
    });
    const detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });

    expect(viewportLayout).toHaveClass(
      "grid",
      "h-dvh",
      "grid-rows-[58px_minmax(0,1fr)]",
    );
    expect(viewportLayout.style.getPropertyValue("--detail-pane-width")).toBe(
      "30%",
    );
    expect(topbar.parentElement).toBe(viewportLayout);
    expect(workspace.parentElement).toBe(viewportLayout);
    expect(detailPane.parentElement).toBe(workspace);
    expect(detailPane).toHaveClass("h-full", "min-h-0");
    expect(detailPane).not.toHaveClass("h-dvh");
    expect(detailPane.className).not.toMatch(
      /(?:^|\s)(?:fixed|absolute|z-\S+)(?:\s|$)/,
    );
    expect(workspace).toHaveClass(
      "min-h-0",
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
    );
    expect(workspace.className).not.toContain(
      "lg:grid-cols-[270px_minmax(0,1fr)]",
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
      "Type Plan, No 10, Title MCP-only document pipeline, Status In progress, Links 2, Updated 2026년 7월 18일 오전 11:00, Tasks collapsed",
    );
    const rowColumns = Array.from(currentPlanRow.children);
    expect(rowColumns).toHaveLength(6);
    expect(currentPlanRow).toHaveClass("min-w-[740px]");
    expect(rowColumns[0]).toHaveTextContent(/^Plan$/);
    expect(rowColumns[1]).toHaveTextContent(/^10$/);
    expect(rowColumns[2]).toHaveTextContent(/MCP-only document pipeline/);
    expect(rowColumns[2]?.querySelector("small")).toHaveTextContent(
      "1/2 Tasks complete",
    );
    expect(rowColumns[3]).toHaveTextContent(/^In progress$/);
    expect(rowColumns[4]).toHaveTextContent(/^2$/);
    expect(rowColumns[5]).toHaveTextContent(
      /^2026년 7월 18일 오전 11:00$/,
    );
    for (const column of rowColumns) {
      expect(column).not.toHaveClass("max-lg:hidden");
    }

    fireEvent.click(screen.getByRole("button", { name: /Research/ }));
    const researchRow = within(recordsPane).getByRole("option", {
      name: /Dashboard research evidence/,
    });
    const researchColumns = Array.from(researchRow.children);
    expect(researchColumns[1]).toHaveTextContent(/^30$/);
    expect(researchColumns[2]).toHaveTextContent(/^Dashboard research evidence$/);
    expect(researchColumns[2]?.querySelector("small")).toBeNull();
    expect(researchColumns[5]).toHaveTextContent(
      /^2026년 7월 18일 오전 11:00$/,
    );
  });

  it("Wireframes 목록은 All versions 없이 실제 version을 최신순으로 제공하고 선택한 version만 표시한다", () => {
    const overview = {
      ...createWireframe({
        id: 610,
        index: "1",
        title: "Portfolio overview",
      }),
      version: 3,
    };
    const detail = {
      ...createWireframe({
        id: 611,
        index: "1.1",
        parentId: overview.id,
        title: "Portfolio detail",
      }),
      version: 3,
    };
    const previousVersion = {
      ...createWireframe({
        id: 612,
        index: "1",
        title: "Previous portfolio overview",
      }),
      version: 2,
    };
    const context = createProjectContext({
      wireframes: [overview, detail, previousVersion],
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
    const recordsHeader = records.previousElementSibling;
    if (!(recordsHeader instanceof HTMLElement)) {
      throw new Error("Wireframe records column header is missing");
    }

    expect(
      Array.from(recordsHeader.children, (column) => column.textContent),
    ).toEqual(["Type", "No", "Index", "Title", "Updated"]);
    expect(within(recordsHeader).queryByText("Status")).not.toBeInTheDocument();
    expect(within(recordsHeader).queryByText("Links")).not.toBeInTheDocument();

    const detailRow = within(records).getByRole("option", {
      name: /Portfolio detail/,
    });
    expect(detailRow).toHaveAccessibleName(
      "Type Wireframe, No 611, Index 1.1, Title Portfolio detail, Updated 2026년 7월 18일 오전 11:00",
    );
    expect(detailRow).not.toHaveAccessibleName(/Status|Links/);
    const rowColumns = Array.from(detailRow.children);
    expect(rowColumns).toHaveLength(5);
    expect(rowColumns[0]).toHaveTextContent(/^Wireframe$/);
    expect(rowColumns[1]).toHaveTextContent(/^611$/);
    expect(rowColumns[2]).toHaveTextContent(/^1.1$/);
    expect(rowColumns[3]).toHaveTextContent(/Portfolio detail/);
    expect(rowColumns[4]).toHaveTextContent(
      /^2026년 7월 18일 오전 11:00$/,
    );

    expect(
      screen.queryByRole("combobox", { name: "Status" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("All status")).not.toBeInTheDocument();
    const versionFilter = screen.getByRole("combobox", { name: "Version" });
    expect(
      within(versionFilter).getAllByRole("option").map((option) => ({
        label: option.textContent,
        value: (option as HTMLOptionElement).value,
      })),
    ).toEqual([
      { label: "v3", value: "3" },
      { label: "v2", value: "2" },
    ]);
    expect(
      within(versionFilter).queryByRole("option", { name: "All versions" }),
    ).not.toBeInTheDocument();
    expect(versionFilter).toHaveValue("3");
    expect(within(records).getAllByRole("option")).toHaveLength(2);
    expect(
      within(records).queryByRole("option", {
        name: /Previous portfolio overview/,
      }),
    ).not.toBeInTheDocument();

    fireEvent.change(versionFilter, { target: { value: "2" } });
    expect(within(records).getAllByRole("option")).toHaveLength(1);
    expect(
      within(records).getByRole("option", {
        name: /Previous portfolio overview/,
      }),
    ).toBeInTheDocument();
  });

  it("Wireframe relation을 다시 선택하면 최신 Version으로 시작한다", () => {
    const wireframeV4 = createWireframe({
      id: 730,
      title: "Wireframe v4",
      version: 4,
    });
    const wireframeV2 = createWireframe({
      id: 731,
      title: "Wireframe v2",
      version: 2,
    });
    const wireframes = [wireframeV4, wireframeV2];
    const asset = createAsset({ id: 740 });
    const context = createProjectContext({ assets: [asset], wireframes });

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
    expect(screen.getByRole("combobox", { name: "Version" })).toHaveValue(
      "4",
    );
    expect(within(records).getAllByRole("option")).toHaveLength(1);

    fireEvent.change(screen.getByRole("combobox", { name: "Version" }), {
      target: { value: "2" },
    });
    expect(within(records).getAllByRole("option")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Assets/ }));

    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    expect(screen.getByRole("combobox", { name: "Version" })).toHaveValue(
      "4",
    );
    expect(within(records).getAllByRole("option")).toHaveLength(1);
  });

  it("일반 relation 목록은 기존 Status 필터와 Status·Links 칼럼을 유지한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const recordsHeader = records.previousElementSibling;
    if (!(recordsHeader instanceof HTMLElement)) {
      throw new Error("Plan records column header is missing");
    }

    const statusFilter = screen.getByRole("combobox", { name: "Status" });
    expect(statusFilter).toHaveValue("All");
    expect(
      within(statusFilter).getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["All status", "Completed", "In progress", "Pending"]);
    expect(
      screen.queryByRole("combobox", { name: "Version" }),
    ).not.toBeInTheDocument();
    expect(
      Array.from(recordsHeader.children, (column) => column.textContent),
    ).toEqual(["Type", "No", "Title", "Status", "Links", "Updated"]);
  });

  it("Plan 저장 status를 Pending, In progress, Completed로 표시한다", () => {
    const context = createProjectContext({
      plans: [
        createPlan({ id: 601, status: "PENDING", title: "Pending plan" }),
        createPlan({
          id: 602,
          status: "IN_PROGRESS",
          title: "Active plan",
        }),
        createPlan({
          id: 603,
          status: "COMPLETED",
          title: "Completed plan",
        }),
      ],
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

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    for (const { label, title } of [
      { label: "Pending", title: "Pending plan" },
      { label: "In progress", title: "Active plan" },
      { label: "Completed", title: "Completed plan" },
    ]) {
      expect(
        within(records).getByRole("option", { name: new RegExp(title) }),
      ).toHaveAccessibleName(new RegExp(`Status ${label}`));
    }
  });

  it("Plan Status 필터는 Wireframe Version 기본 필터를 오염시키지 않는다", () => {
    const completedTask = createTask({
      id: 620,
      planId: 610,
      status: "COMPLETED",
      title: "Completed delivery task",
    });
    const pendingTask = createTask({
      id: 621,
      planId: 610,
      status: "PENDING",
      title: "Pending delivery task",
    });
    const plan = createPlan({
      id: 610,
      status: "IN_PROGRESS",
      tasks: [completedTask, pendingTask],
    });
    const wireframes = [
      { ...createWireframe({ id: 630, index: "1" }), version: 3 },
      { ...createWireframe({ id: 631, index: "1.1" }), version: 3 },
      { ...createWireframe({ id: 632, index: "1" }), version: 2 },
    ];
    const context = createProjectContext({
      plans: [plan],
      tasks: [completedTask, pendingTask],
      wireframes,
    });
    const projects = [createProjectSummary(context)];
    const { rerender } = render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={projects}
        selectedArtifactId={plan.id}
        selectedTaskId={null}
      />,
    );
    const records = screen.getByRole("listbox", { name: "Artifact records" });

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "Pending" },
    });
    expect(within(records).getAllByRole("option")).toHaveLength(2);
    expect(
      within(records).getByRole("option", { name: /Plan/ }),
    ).toHaveAttribute("data-plan-expanded", "true");
    expect(
      within(records).getByRole("option", {
        name: /Pending delivery task/,
      }),
    ).toBeInTheDocument();
    expect(
      within(records).queryByRole("option", {
        name: /Completed delivery task/,
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    rerender(
      <Dashboard
        activeRelation="wireframes"
        context={context}
        projects={projects}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(screen.getByRole("combobox", { name: "Version" })).toHaveValue(
      "3",
    );
    expect(within(records).getAllByRole("option")).toHaveLength(2);
    expect(
      within(records).queryByRole("option", { name: /No 632,/ }),
    ).not.toBeInTheDocument();
  });

  it("Wireframe Version 필터는 Plans 목록에 적용되지 않는다", () => {
    const wireframes = [
      { ...createWireframe({ id: 640, index: "1" }), version: 3 },
      { ...createWireframe({ id: 641, index: "1" }), version: 2 },
    ];
    const context = createProjectContext({
      plans: [
        createPlan({ id: 650, status: "IN_PROGRESS" }),
        createPlan({ id: 651, status: "COMPLETED" }),
      ],
      wireframes,
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

    fireEvent.change(screen.getByRole("combobox", { name: "Version" }), {
      target: { value: "2" },
    });
    expect(within(records).getAllByRole("option")).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: /Plans/ }));
    expect(within(records).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue(
      "All",
    );
  });

  it("main header row와 detail header는 수축 없는 동일한 58px 높이를 유지한다", () => {
    renderWorkbench();

    const { viewportLayout } = getWorkbenchLayout();
    const detailPane = screen.getByRole("complementary", {
      name: "MCP-only document pipeline",
    });
    const detailHeading = within(detailPane).getByRole("heading", {
      name: "MCP-only document pipeline",
    });
    const detailHeader = detailHeading.parentElement?.parentElement;

    if (!(detailHeader instanceof HTMLElement)) {
      throw new Error("Record detail header is missing");
    }

    expect(viewportLayout).toHaveClass(
      "grid-rows-[58px_minmax(0,1fr)]",
    );
    expect(detailHeader).toHaveClass("h-[58px]");
    expect(detailHeader.className).toMatch(
      /(?:^|\s)(?:min-h-\[58px\]|shrink-0)(?:\s|$)/,
    );
    expect(detailHeader).not.toHaveClass("min-h-14");
  });

  it("desktop detail pane을 닫아 Records를 확장하고 같은 또는 다른 record 선택으로 다시 연다", () => {
    renderWorkbench();

    const { workspace } = getWorkbenchLayout();
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
    );
    expect(workspace).not.toHaveClass(
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
    );
    expect(selectedRow).toHaveAttribute("aria-selected", "true");

    fireEvent.click(selectedRow);
    expect(detailPane).not.toHaveClass("hidden");
    expect(workspace).toHaveClass(
      "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
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
    );
  });

  it("선택된 범용 record detail header에는 제목과 닫기 제어만 제공한다", () => {
    renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: /Research/ }));
    fireEvent.click(
      within(
        screen.getByRole("listbox", { name: "Artifact records" }),
      ).getByRole("option", { name: /Dashboard research evidence/ }),
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Dashboard research evidence",
    });
    const detailHeading = within(detailPane).getByRole("heading", {
      name: "Dashboard research evidence",
    });
    const detailHeader = detailHeading.parentElement?.parentElement;

    if (!(detailHeader instanceof HTMLElement)) {
      throw new Error("Record detail header is missing");
    }

    expect(
      within(detailHeader).getByRole("button", { name: "Close detail pane" }),
    ).toBeInTheDocument();
    expect(
      within(detailHeader).queryByText(/^RESEARCH · #30$/),
    ).not.toBeInTheDocument();
  });

  it("선택 record가 없는 detail header에 안내 fallback을 렌더하지 않는다", () => {
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

    const detailPane = screen.getByRole("complementary", {
      name: "Select a record",
    });
    const detailHeading = within(detailPane).getByRole("heading", {
      name: "Select a record",
    });
    const detailHeader = detailHeading.parentElement?.parentElement;

    if (!(detailHeader instanceof HTMLElement)) {
      throw new Error("Empty record detail header is missing");
    }

    expect(
      within(detailHeader).getByRole("button", { name: "Close detail pane" }),
    ).toBeInTheDocument();
    expect(
      within(detailHeader).queryByText("Choose a record to inspect"),
    ).not.toBeInTheDocument();
  });

  it("모든 record Inspector에서 탭 UI 없이 Metadata 콘텐츠를 직접 제공한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const cases = [
      {
        contentTitle: null,
        relationName: /Research/,
        rowName: /Dashboard research evidence/,
        typeLabel: "Research",
      },
      {
        contentTitle: getDesktopHtmlPreviewTitle("Artifact workbench flow"),
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
    const { viewportLayout } = getWorkbenchLayout();

    fireEvent.pointerDown(separator, {
      button: 0,
      clientX: 900,
      pointerId: 4,
    });
    fireEvent.pointerMove(separator, { clientX: 740, pointerId: 4 });
    fireEvent.pointerUp(separator, { clientX: 740, pointerId: 4 });
    expect(separator).toHaveAttribute("aria-valuenow", "40");
    expect(viewportLayout.style.getPropertyValue("--detail-pane-width")).toBe(
      "40%",
    );

    setWindowInnerWidth(800);
    fireEvent.resize(window);

    expect(separator).toHaveAttribute("aria-valuemin", "15");
    expect(separator).toHaveAttribute("aria-valuemax", "70");
    expect(separator).toHaveAttribute("aria-valuenow", "40");
    expect(viewportLayout.style.getPropertyValue("--detail-pane-width")).toBe(
      "40%",
    );
  });

  it("detail pane separator를 ArrowLeft / ArrowRight로 키보드 조절한다", () => {
    renderWorkbench();

    const separator = screen.getByRole("separator", {
      name: "Resize detail pane",
    });
    const { viewportLayout } = getWorkbenchLayout();
    const initialWidth = Number(separator.getAttribute("aria-valuenow"));

    fireEvent.keyDown(separator, { key: "ArrowLeft" });
    const expandedWidth = Number(separator.getAttribute("aria-valuenow"));
    expect(expandedWidth).toBeGreaterThan(initialWidth);
    expect(viewportLayout.style.getPropertyValue("--detail-pane-width")).toBe(
      `${expandedWidth}%`,
    );

    fireEvent.keyDown(separator, { key: "ArrowRight" });
    const contractedWidth = Number(separator.getAttribute("aria-valuenow"));
    expect(contractedWidth).toBeLessThan(expandedWidth);
    expect(viewportLayout.style.getPropertyValue("--detail-pane-width")).toBe(
      `${contractedWidth}%`,
    );
  });

  it("Plan 행을 같은 목록에서 펼쳐 Task 계층을 표시하고 다시 접으며 Task deep link를 유지한다", () => {
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
      "Research",
      "Domains",
      "Architecture",
      "Wireframes",
      "Assets",
      "Reviews",
    ]) {
      expect(
        within(tree).getByRole("button", {
          name: new RegExp(`^${label}\\s*\\d+$`),
        }),
      ).toBeInTheDocument();
    }

    const currentPlanRow = within(records).getByRole("option", {
      name: /MCP-only document pipeline/,
    });
    const otherPlanRow = within(records).getByRole("option", {
      name: /Previous delivery plan/,
    });
    expect(within(records).getAllByRole("option")).toEqual([
      currentPlanRow,
      otherPlanRow,
    ]);
    expect(currentPlanRow).toHaveAttribute("data-plan-expanded", "false");
    expect(currentPlanRow).toHaveAccessibleName(/Tasks collapsed$/);
    expect(otherPlanRow).toHaveAttribute("data-plan-expanded", "false");
    expect(otherPlanRow).toHaveAccessibleName(/Tasks collapsed$/);
    expect(
      within(records).queryByRole("option", { name: /API boundary/ }),
    ).not.toBeInTheDocument();
    expect(
      within(records).queryByRole("option", { name: /Browser QA/ }),
    ).not.toBeInTheDocument();

    fireEvent.click(currentPlanRow);

    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=plans&id=10",
      { scroll: false },
    );
    const completedTaskRow = within(records).getByRole("option", {
      name: /API boundary/,
    });
    const pendingTaskRow = within(records).getByRole("option", {
      name: /Browser QA/,
    });
    expect(currentPlanRow).toHaveAttribute("data-plan-expanded", "true");
    expect(currentPlanRow).toHaveAccessibleName(/Tasks expanded$/);
    expect(otherPlanRow).toHaveAttribute("data-plan-expanded", "false");
    expect(otherPlanRow).toHaveAccessibleName(/Tasks collapsed$/);
    expect(within(records).getAllByRole("option")).toEqual([
      currentPlanRow,
      completedTaskRow,
      pendingTaskRow,
      otherPlanRow,
    ]);
    expect(
      within(records).queryByRole("option", { name: /Unrelated plan task/ }),
    ).not.toBeInTheDocument();
    for (const taskRow of [completedTaskRow, pendingTaskRow]) {
      expect(
        taskRow.querySelector('[data-plan-task-depth="1"]'),
      ).not.toBeNull();
      expect(
        taskRow.querySelector("[data-plan-task-branch]"),
      ).not.toBeNull();
      expect(taskRow).toHaveAccessibleDescription(
        "Parent Plan: MCP-only document pipeline",
      );
    }

    fireEvent.click(completedTaskRow);
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=plans&id=10&taskId=20",
      { scroll: false },
    );
    rerender(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={projects}
        selectedArtifactId={10}
        selectedTaskId={20}
      />,
    );
    expect(within(records).getAllByRole("option")).toEqual([
      currentPlanRow,
      completedTaskRow,
      pendingTaskRow,
      otherPlanRow,
    ]);

    fireEvent.click(currentPlanRow);
    expect(currentPlanRow).toHaveAttribute("data-plan-expanded", "false");
    expect(currentPlanRow).toHaveAccessibleName(/Tasks collapsed$/);
    expect(within(records).getAllByRole("option")).toEqual([
      currentPlanRow,
      otherPlanRow,
    ]);
    expect(
      within(records).queryByRole("option", { name: /API boundary/ }),
    ).not.toBeInTheDocument();
    expect(
      within(records).queryByRole("option", { name: /Browser QA/ }),
    ).not.toBeInTheDocument();
  });

  it("preview navigation은 source를 검증해 wireframe id를 우선하고 index로 fallback한다", () => {
    renderWorkbench();

    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    fireEvent.click(
      screen.getByRole("option", { name: /Artifact workbench flow/ }),
    );

    const initialPreview = screen.getByTitle(
      getDesktopHtmlPreviewTitle("Artifact workbench flow"),
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
      getDesktopHtmlPreviewTitle("ID target wireframe"),
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

  it("Wireframe의 상대 HTML navigation은 기존 대상 Wireframe 선택을 유지한다", () => {
    const { sourceWireframe, targetWireframe } =
      renderPreviewNavigationWorkbench();
    const sourcePreview = screen.getByTitle(
      getDesktopHtmlPreviewTitle(sourceWireframe.title),
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

  it("Cmd/Ctrl+K, Escape, relation/status filter로 현재 목록을 좁힌다", () => {
    renderWorkbench();

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

    fireEvent.click(screen.getByRole("button", { name: /Assets/ }));
    expect(screen.getByRole("button", { name: /Assets/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(within(records).getAllByRole("option")).toHaveLength(1);
    expect(
      within(records).getByRole("option", { name: /Workbench interface tokens/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Plans/ }));
    fireEvent.click(
      within(records).getByRole("option", {
        name: /MCP-only document pipeline/,
      }),
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "Pending" },
    });
    expect(within(records).getAllByRole("option")).toHaveLength(3);
    expect(
      within(records).getByRole("option", {
        name: /MCP-only document pipeline/,
      }),
    ).toHaveAttribute("data-plan-expanded", "true");
    expect(
      within(records).getByRole("option", { name: /Browser QA/ }),
    ).toBeInTheDocument();
    expect(
      within(records).getByRole("option", { name: /Previous delivery plan/ }),
    ).toBeInTheDocument();
    expect(
      within(records).queryByRole("option", { name: /API boundary/ }),
    ).not.toBeInTheDocument();
  });

  it("320px와 390px topbar는 검색을 숨기고 hidden input에 shortcut focus를 보내지 않는다", () => {
    setWindowInnerWidth(390);
    fireEvent.resize(window);
    renderWorkbench();

    const topbar = screen.getByRole("banner");
    const search = within(topbar).getByRole("searchbox", {
      name: /Search records/,
    });
    const searchLabel = search.parentElement;
    const mobileNavigation = within(topbar).getByRole("navigation", {
      name: "Mobile panes",
    });

    if (!(searchLabel instanceof HTMLLabelElement)) {
      throw new Error("Search label is missing");
    }

    expect(topbar).toHaveClass("overflow-hidden");
    expect(topbar.parentElement).toHaveClass(
      "w-screen",
      "min-w-0",
      "max-w-full",
    );
    expect(searchLabel).toHaveClass("hidden", "md:block");
    for (const paneButton of within(mobileNavigation).getAllByRole("button")) {
      expect(paneButton).toHaveClass("min-h-11", "min-w-11");
    }

    fireEvent.keyDown(document, { key: "k", metaKey: true });
    expect(search).not.toHaveFocus();

    setWindowInnerWidth(320);
    fireEvent.resize(window);
    fireEvent.keyDown(document, { ctrlKey: true, key: "k" });
    expect(search).not.toHaveFocus();
  });

  it("record 선택 시 Metadata inspector 콘텐츠를 유지한다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    fireEvent.click(screen.getByRole("button", { name: /Assets/ }));
    const assetRow = within(records).getByRole("option", {
      name: /Workbench interface tokens/,
    });

    fireEvent.click(assetRow);
    expect(assetRow).toHaveAttribute("aria-selected", "true");
    const detailPane = screen.getByRole("complementary", {
      name: "Workbench interface tokens",
    });
    expect(
      within(detailPane).getByRole("heading", {
        level: 2,
        name: "Workbench interface tokens",
      }),
    ).toBeInTheDocument();

    const metadataContent = getMetadataContent(detailPane);
    expect(
      within(metadataContent).getByTitle(
        "Workbench interface tokens HTML preview",
      ),
    ).toHaveAttribute("srcdoc", expect.stringContaining("Logo and color palette"));
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
    fireEvent.click(screen.getByRole("button", { name: /Wireframes/ }));
    fireEvent.click(
      within(records).getByRole("option", {
        name: /Artifact workbench flow/,
      }),
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Artifact workbench flow",
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
      getDesktopHtmlPreviewTitle("Artifact workbench flow"),
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
    const { sourceWireframe, targetWireframe } = renderPreviewNavigationWorkbench();
    const sourcePreview = screen.getByTitle(
      getDesktopHtmlPreviewTitle(sourceWireframe.title),
    ) as HTMLIFrameElement;

    dispatchPreviewScroll(sourcePreview, 160);

    let detailPane = screen.getByRole("complementary", {
      name: sourceWireframe.title,
    });
    expect(
      within(detailPane).getByRole("region", { name: "Record details" }),
    ).toHaveAttribute("data-metadata-collapsed", "true");

    fireEvent.click(
      screen.getByRole("option", {
        name: new RegExp(targetWireframe.title, "i"),
      }),
    );

    detailPane = screen.getByRole("complementary", {
      name: targetWireframe.title,
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
  ])(
    "$kind Metadata에 record HTML iframe을 즉시 렌더한다",
    ({ activeRelation, buildContext, kind, marker }) => {
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
        kind === "Asset"
          ? `${record.title} HTML preview`
          : getDesktopHtmlPreviewTitle(record.title),
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
    const context = createProjectContext({
      assets: [asset],
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
      "Type Wireframe, No 631, Index 3.1, Title Case study detail, Updated 2026년 7월 18일 오전 11:00",
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

    for (const testCase of [{ relation: /Assets/, record: asset }]) {
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
      getDesktopHtmlPreviewTitle("Selected inline wireframe"),
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

  it("Asset도 Metadata의 inline HTML iframe 경로를 사용한다", () => {
    const asset = createAsset({
      html: "<!doctype html><html><head></head><body>Inline asset marker</body></html>",
      id: 70,
      title: "Inline asset",
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
      name: "Inline asset",
    });
    expect(
      within(detailPane).getByTitle("Inline asset HTML preview"),
    ).toHaveAttribute("srcdoc", expect.stringContaining("Inline asset marker"));

    expect(
      within(detailPane).queryByRole("tab"),
    ).not.toBeInTheDocument();
  });

  it("Research 여러 record를 updatedAt 최신순으로 표시하고 최신 record를 기본 선택한다", () => {
    const { context } = createWorkbenchFixture();
    const older = createArtifact({
      id: 301,
      title: "Older research evidence",
      updatedAt: "2026-07-18T01:00:00.000Z",
    });
    const newer = createArtifact({
      id: 302,
      title: "Newer research evidence",
      updatedAt: "2026-07-18T03:00:00.000Z",
    });
    const projectContext = { ...context, research: [older, newer] };

    render(
      <Dashboard
        activeRelation="research"
        context={projectContext}
        projects={[createProjectSummary(projectContext)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const rows = within(records).getAllByRole("option");

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining("Newer research evidence"),
      expect.stringContaining("Older research evidence"),
    ]);
    expect(
      screen.getByRole("complementary", { name: "Newer research evidence" }),
    ).toBeInTheDocument();
  });

  it("stale Research id는 첫 record로 대체하지 않고 not-found 상태를 표시한다", () => {
    const { context } = createWorkbenchFixture();
    const projectContext = {
      ...context,
      research: [createArtifact({ id: 311, title: "Existing research" })],
    };

    render(
      <Dashboard
        activeRelation="research"
        context={projectContext}
        projects={[createProjectSummary(projectContext)]}
        selectedArtifactId={999}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Research not found" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Research #999 does not exist in this project.")).toBeInTheDocument();
    expect(
      screen.queryByRole("complementary", { name: "Existing research" }),
    ).not.toBeInTheDocument();
  });

  it("status 필드가 없는 Research의 Metadata에 Status 행을 렌더하지 않는다", () => {
    const { context } = createWorkbenchFixture();
    const research = createArtifact({
      id: 30,
      title: "Dashboard research evidence",
    });
    const projectContext = { ...context, research: [research] };

    render(
      <Dashboard
        activeRelation="research"
        context={projectContext}
        projects={[createProjectSummary(projectContext)]}
        selectedArtifactId={research.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: research.title,
    });
    expect(
      within(detailPane).queryByText("Status", { selector: "dt" }),
    ).not.toBeInTheDocument();
  });

  it("status 필드가 없는 record 목록에 하드코딩 상태를 표시하지 않는다", () => {
    renderWorkbench();

    const records = screen.getByRole("listbox", { name: "Artifact records" });
    const cases: Array<{
      relationName: RegExp;
      role: "option" | "treeitem";
      rowName: RegExp;
      status: string;
      typeLabelOccurrences: number;
    }> = [
      {
        relationName: /Research/,
        role: "option",
        rowName: /Dashboard research evidence/,
        status: "Research",
        typeLabelOccurrences: 1,
      },
      {
        relationName: /Domains/,
        rowName: /Harness business domain/,
        status: "Completed",
        typeLabelOccurrences: 0,
        role: "treeitem" as const,
      },
      {
        relationName: /^Architecture\s*1$/,
        rowName: /Harness production/,
        status: "Snapshot",
        typeLabelOccurrences: 0,
        role: "option" as const,
      },
      {
        relationName: /Wireframes/,
        role: "option",
        rowName: /Artifact workbench flow/,
        status: "HTML",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Assets/,
        role: "option",
        rowName: /Workbench interface tokens/,
        status: "HTML",
        typeLabelOccurrences: 0,
      },
      {
        relationName: /Reviews/,
        role: "option",
        rowName: /MCP boundary review/,
        status: "Completed",
        typeLabelOccurrences: 0,
      },
    ];

    for (const testCase of cases) {
      fireEvent.click(
        screen.getByRole("button", { name: testCase.relationName }),
      );
      const row = within(records).getByRole(testCase.role, {
        name: testCase.rowName,
      });

      expect(within(row).queryAllByText(testCase.status)).toHaveLength(
        testCase.typeLabelOccurrences,
      );
      expect(within(row).queryByText("Document")).not.toBeInTheDocument();
    }
  });

  it("Domain deep link의 조상을 펼치고 breadcrumb·부모·Markdown을 표시한다", () => {
    const root = createDomain({
      content: "# Commerce\n\nCustomer purchase rules.",
      id: 100,
      title: "Commerce",
    });
    const child = createDomain({
      content: "# Orders\n\nOrder invariants.",
      id: 110,
      parentId: root.id,
      title: "Orders",
    });
    const leaf = createDomain({
      content: "# Fulfillment rules\n\nShipment policy.",
      id: 120,
      parentId: child.id,
      title: "Fulfillment",
    });
    const context = createProjectContext({ domains: [leaf, root, child] });

    render(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={leaf.id}
        selectedTaskId={null}
      />,
    );

    const tree = screen.getByRole("tree", { name: "Domain hierarchy" });
    const rootItem = within(tree).getByRole("treeitem", {
      name: /Domain Commerce/,
    });
    const childItem = within(tree).getByRole("treeitem", {
      name: /Domain Orders/,
    });
    const leafItem = within(tree).getByRole("treeitem", {
      name: /Domain Fulfillment/,
    });

    expect(rootItem).toHaveAttribute("aria-level", "1");
    expect(rootItem).toHaveAttribute("aria-expanded", "true");
    expect(rootItem).toHaveAttribute("aria-posinset", "1");
    expect(rootItem).toHaveAttribute("aria-setsize", "1");
    expect(rootItem).toHaveAttribute("tabindex", "-1");
    expect(childItem).toHaveAttribute("aria-level", "2");
    expect(childItem).toHaveAttribute("aria-expanded", "true");
    expect(childItem).toHaveAttribute("tabindex", "-1");
    expect(leafItem).toHaveAttribute("aria-level", "3");
    expect(leafItem).toHaveAttribute("aria-selected", "true");
    expect(leafItem).toHaveAttribute("tabindex", "0");
    expect(within(tree).getAllByRole("treeitem", { hidden: true }).filter(
      (item) => item.getAttribute("tabindex") === "0",
    )).toHaveLength(1);

    leafItem.focus();
    fireEvent.keyDown(leafItem, { key: "ArrowLeft" });
    expect(childItem).toHaveFocus();
    fireEvent.keyDown(childItem, { key: "ArrowLeft" });
    expect(
      within(tree).queryByRole("treeitem", { name: /Domain Fulfillment/ }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(childItem, { key: "ArrowRight" });
    const restoredLeafItem = within(tree).getByRole("treeitem", {
      name: /Domain Fulfillment/,
    });
    fireEvent.keyDown(childItem, { key: "ArrowDown" });
    expect(restoredLeafItem).toHaveFocus();

    const detailPane = screen.getByRole("complementary", {
      name: leaf.title,
    });
    const breadcrumb = within(detailPane).getByRole("navigation", {
      name: "Domain breadcrumb",
    });
    expect(breadcrumb).toHaveTextContent("Commerce/Orders/Fulfillment");
    expect(within(detailPane).getByText("Orders", { selector: "dd" })).toBeInTheDocument();
    expect(
      within(detailPane).getByText("No immediate children", {
        selector: "dd",
      }),
    ).toBeInTheDocument();
    expect(
      within(detailPane).getByRole("heading", {
        level: 1,
        name: "Fulfillment rules",
      }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument();
    expect(screen.getByText("Read-only hierarchy")).toBeInTheDocument();
  });

  it("Domain을 선택하기 전 안내하고 검색 시 일치 node의 조상을 함께 표시한다", () => {
    const root = createDomain({ id: 200, title: "Commerce" });
    const child = createDomain({
      id: 210,
      parentId: root.id,
      title: "Orders",
    });
    const leaf = createDomain({
      content: "Shipment policy",
      id: 220,
      parentId: child.id,
      title: "Fulfillment",
    });
    const context = createProjectContext({ domains: [root, child, leaf] });

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
      screen.getByRole("complementary", { name: "Select a Domain" }),
    ).toBeInTheDocument();
    const tree = screen.getByRole("tree", { name: "Domain hierarchy" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(1);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search records" }), {
      target: { value: "Shipment policy" },
    });

    expect(within(tree).getAllByRole("treeitem")).toHaveLength(3);
    expect(
      within(tree).getByRole("treeitem", { name: /^Domain Commerce,/ }),
    ).toBeInTheDocument();
    expect(
      within(tree).getByRole("treeitem", { name: /^Domain Orders,/ }),
    ).toBeInTheDocument();
    expect(
      within(tree).getByRole("treeitem", { name: /^Domain Fulfillment,/ }),
    ).toBeInTheDocument();
    const searchRoot = within(tree).getByRole("treeitem", {
      name: /^Domain Commerce,/,
    });
    expect(searchRoot).toHaveAttribute("aria-expanded", "true");
    fireEvent.keyDown(searchRoot, { key: "ArrowLeft" });
    expect(searchRoot).toHaveAttribute("aria-expanded", "false");
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(1);
    fireEvent.keyDown(searchRoot, { key: "ArrowRight" });
    expect(within(tree).getAllByRole("treeitem")).toHaveLength(3);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search records" }), {
      target: { value: "no such domain" },
    });
    expect(screen.getByText("No matching Domains")).toBeInTheDocument();
  });

  it("잘못된 Domain deep link와 빈 프로젝트를 서로 다른 상태로 표시한다", () => {
    const context = createProjectContext({
      domains: [createDomain({ id: 300, title: "Identity" })],
    });
    const { unmount } = render(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={999}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("complementary", { name: "Domain not found" }),
    ).toHaveTextContent("Domain #999 does not exist in this project.");

    unmount();
    const emptyContext = createProjectContext({ domains: [] });
    render(
      <Dashboard
        activeRelation="domains"
        context={emptyContext}
        projects={[createProjectSummary(emptyContext)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );
    expect(screen.getByText("No Domain pages")).toBeInTheDocument();
  });

  it("같은 project mount에서 Domain URL id 변경을 선택·not-found·안내 상태에 동기화한다", () => {
    const root = createDomain({ id: 310, title: "Commerce" });
    const child = createDomain({
      id: 320,
      parentId: root.id,
      title: "Orders",
    });
    const context = createProjectContext({ domains: [root, child] });
    const projects = [createProjectSummary(context)];
    const { rerender } = render(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={projects}
        selectedArtifactId={root.id}
        selectedTaskId={null}
      />,
    );

    expect(screen.getByRole("complementary", { name: root.title })).toBeInTheDocument();
    rerender(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={projects}
        selectedArtifactId={child.id}
        selectedTaskId={null}
      />,
    );
    expect(screen.getByRole("complementary", { name: child.title })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Domain breadcrumb" })).toHaveTextContent(
      "Commerce/Orders",
    );

    rerender(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={projects}
        selectedArtifactId={999}
        selectedTaskId={null}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Domain not found" })).toHaveTextContent(
      "Domain #999 does not exist in this project.",
    );

    rerender(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={projects}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );
    expect(screen.getByRole("complementary", { name: "Select a Domain" })).toBeInTheDocument();
  });

  it("손상된 Domain parent와 cycle은 경고 fallback root로 각각 한 번만 표시한다", () => {
    const orphan = createDomain({ id: 330, parentId: 999, title: "Orphan" });
    const cycleA = createDomain({ id: 340, parentId: 350, title: "Cycle A" });
    const cycleB = createDomain({ id: 350, parentId: 340, title: "Cycle B" });
    const context = createProjectContext({ domains: [cycleB, orphan, cycleA] });

    render(
      <Dashboard
        activeRelation="domains"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={orphan.id}
        selectedTaskId={null}
      />,
    );

    const treeItems = within(
      screen.getByRole("tree", { name: "Domain hierarchy" }),
    ).getAllByRole("treeitem");
    expect(treeItems).toHaveLength(3);
    expect(treeItems.map((item) => item.getAttribute("data-domain-id"))).toEqual([
      "330",
      "340",
      "350",
    ]);
    expect(treeItems.every((item) => item.getAttribute("aria-level") === "1")).toBe(true);
    expect(treeItems[0]).toHaveAccessibleName(/Hierarchy warning missing-parent/);
    expect(treeItems[1]).toHaveAccessibleName(/Hierarchy warning cycle/);
    expect(treeItems[2]).toHaveAccessibleName(/Hierarchy warning cycle/);
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

  it("Research 본문의 Markdown을 의미 요소로 렌더하고 raw HTML은 실행하지 않는다", () => {
    const { context } = createWorkbenchFixture();
    const research = createArtifact({
      content: `# Rendered heading

## Evidence section

- First item
- **Important evidence** with \`inline code\` and [reference](https://example.com/reference).

<button id="unsafe-markup" onclick="window.__unsafeMarkdownExecuted = true">Unsafe button</button>
<script>window.__unsafeMarkdownExecuted = true</script>`,
      id: 30,
      title: "Structured Markdown research",
    });
    const projectContext = { ...context, research: [research] };

    const { container } = render(
      <Dashboard
        activeRelation="research"
        context={projectContext}
        projects={[createProjectSummary(projectContext)]}
        selectedArtifactId={research.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: "Structured Markdown research",
    });
    const metadataContent = getMetadataContent(detailPane);

    expect(
      within(metadataContent).getByText("Structured Markdown research"),
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

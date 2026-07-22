import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactBrowser } from "./ArtifactBrowser";
import {
  createArtifact,
  createAsset,
  createDesign,
  createPlan,
  createProjectContext,
  createReview,
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

describe("ArtifactBrowser", () => {
  beforeEach(() => {
    routerReplace.mockClear();
  });

  it("선택한 빈 Draft의 로컬 empty 상태를 표시한다", () => {
    const context = createProjectContext({
      drafts: [createArtifact({ title: "Draft 1" })],
    });

    render(
      <ArtifactBrowser
        activeRelation="drafts"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Draft 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No Draft records" }),
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
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Plan 1" }),
    ).toBeInTheDocument();
    expect(screen.getByText("v3 · 1/2 Tasks completed")).toBeInTheDocument();
  });

  it("Wireframe과 Asset relation은 각 목록과 project-scoped URL을 사용한다", () => {
    const wireframe = createWireframe({
      html: "<!doctype html><html><body>Standalone wireframe preview</body></html>",
      id: 31,
      title: "Standalone wireframe",
    });
    const asset = createAsset({
      html: "<!doctype html><html><body>Standalone asset preview</body></html>",
      id: 32,
      title: "Standalone asset",
    });
    const context = createProjectContext({
      assets: [asset],
      wireframes: [wireframe],
    });
    const { rerender } = render(
      <ArtifactBrowser
        activeRelation="wireframes"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Wireframe 1" }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: /Standalone wireframe/ }),
    );
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=wireframes&id=31",
      { scroll: false },
    );
    rerender(
      <ArtifactBrowser
        activeRelation="wireframes"
        context={context}
        selectedArtifactId={wireframe.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Standalone wireframe" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Record ID")).toBeInTheDocument();
    expect(screen.getByText("#31")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Wireframe preview" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Wireframe preview: Standalone wireframe",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Standalone wireframe HTML preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Standalone wireframe preview"),
    );

    rerender(
      <ArtifactBrowser
        activeRelation="assets"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Asset 1" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Standalone asset/ }));
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=assets&id=32",
      { scroll: false },
    );
    rerender(
      <ArtifactBrowser
        activeRelation="assets"
        context={context}
        selectedArtifactId={asset.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Standalone asset" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Record ID")).toBeInTheDocument();
    expect(screen.getByText("#32")).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Open Asset preview" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Asset preview: Standalone asset",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Standalone asset HTML preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Standalone asset preview"),
    );
  });

  it("Design relation은 목록 선택 URL, metadata, 명시적 preview CTA를 제공한다", () => {
    const asset = createAsset({ id: 31, title: "Design source asset" });
    const wireframe = createWireframe({
      id: 32,
      title: "Design source wireframe",
    });
    const design = createDesign({
      asset,
      assetId: asset.id,
      html: "<!doctype html><html><body>Standalone design preview</body></html>",
      id: 33,
      title: "Standalone design",
      wireframe,
      wireframeId: wireframe.id,
    });
    const context = createProjectContext({
      assets: [asset],
      designs: [design],
      wireframes: [wireframe],
    });
    const { rerender } = render(
      <ArtifactBrowser
        activeRelation="designs"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Design 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Standalone design/ }));
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=designs&id=33",
      { scroll: false },
    );

    rerender(
      <ArtifactBrowser
        activeRelation="designs"
        context={context}
        selectedArtifactId={design.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.getByRole("heading", { name: "Standalone design" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Record ID")).toBeInTheDocument();
    expect(screen.getByText("#33")).toBeInTheDocument();
    expect(screen.getByText("Created")).toBeInTheDocument();
    expect(screen.getByText("Updated")).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Open Design preview" }),
    );
    expect(
      screen.getByRole("complementary", {
        name: "Design preview: Standalone design",
      }),
    ).toBeInTheDocument();
    expect(screen.getByTitle("Standalone design HTML preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Standalone design preview"),
    );
  });

  it("같은 Design relation에서 선택을 왕복해도 이전 preview를 CTA 클릭 전에 복원하지 않는다", () => {
    const designA = createDesign({
      html: "<!doctype html><html><head></head><body>Design A preview</body></html>",
      id: 41,
      title: "Design A",
    });
    const designB = createDesign({
      html: "<!doctype html><html><head></head><body>Design B preview</body></html>",
      id: 42,
      title: "Design B",
    });
    const context = createProjectContext({ designs: [designA, designB] });
    const { rerender } = render(
      <ArtifactBrowser
        activeRelation="designs"
        context={context}
        selectedArtifactId={designA.id}
        selectedTaskId={null}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Open Design preview" }),
    );
    expect(
      screen.getByRole("complementary", { name: "Design preview: Design A" }),
    ).toBeInTheDocument();

    rerender(
      <ArtifactBrowser
        activeRelation="designs"
        context={context}
        selectedArtifactId={designB.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.queryByRole("complementary", { name: "Design preview: Design A" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design B" })).toBeInTheDocument();

    rerender(
      <ArtifactBrowser
        activeRelation="designs"
        context={context}
        selectedArtifactId={designA.id}
        selectedTaskId={null}
      />,
    );
    expect(
      screen.queryByRole("complementary", { name: "Design preview: Design A" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design A" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Open Design preview" }),
    ).toBeInTheDocument();
  });

  it("모바일 detail의 Back to list는 이전 record trigger로 focus를 복원한다", () => {
    const draft = createArtifact({ id: 7, title: "Draft focus target" });
    const context = createProjectContext({ drafts: [draft] });
    const { rerender } = render(
      <ArtifactBrowser
        activeRelation="drafts"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );
    const recordTrigger = screen.getByRole("button", {
      name: /Draft focus target/,
    });

    recordTrigger.focus();
    fireEvent.click(recordTrigger);
    rerender(
      <ArtifactBrowser
        activeRelation="drafts"
        context={context}
        selectedArtifactId={draft.id}
        selectedTaskId={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    rerender(
      <ArtifactBrowser
        activeRelation="drafts"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(recordTrigger).toHaveFocus();
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=drafts",
      { scroll: false },
    );
  });

  it("Plan detail에서 Task를 선택하면 Task details URL로 이동한다", () => {
    const asset = createAsset({ id: 4, title: "Icon Asset" });
    const wireframe = createWireframe({ id: 5, title: "Dashboard Wireframe" });
    const design = createDesign({
      id: 6,
      title: "Dashboard Design",
      asset,
      assetId: asset.id,
      wireframe,
      wireframeId: wireframe.id,
    });
    const task = createTask({
      id: 2,
      assets: [asset],
      designs: [design],
      title: "Build dashboard",
      wireframes: [wireframe],
    });

    const plan = createPlan({
      id: 3,
      assets: [asset],
      designs: [design],
      reviews: [createReview({ id: 7, planId: 3, title: "QA Review" })],
      tasks: [task],
      wireframes: [wireframe],
    });

    render(
      <ArtifactBrowser
        activeRelation="plans"
        context={createProjectContext({ plans: [plan], tasks: [task] })}
        selectedArtifactId={plan.id}
        selectedTaskId={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Plan hierarchy" })).toBeInTheDocument();
    expect(screen.getByText("QA Review")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Build dashboard/ }));
    expect(routerReplace).toHaveBeenCalledWith(
      "/projects/1?type=plans&id=3&taskId=2",
      { scroll: false },
    );
  });

  it("Task 산출물을 클릭하면 크기 조절 가능한 우측 side page에서 표시한다", () => {
    const asset = createAsset({
      id: 4,
      title: "Icon Asset",
      html: "<!doctype html><html><head><style>:root{--brand:#3559c7}</style></head><body><section>Logo and palette</section></body></html>",
    });
    const wireframe = createWireframe({
      id: 5,
      title: "Dashboard Wireframe",
      html: "<!doctype html><html><head><title>Journey</title></head><body><a href='#done'>Continue</a><section id='done'>Done</section></body></html>",
    });
    const design = createDesign({
      id: 6,
      title: "Dashboard Design",
      asset,
      assetId: asset.id,
      html: "<!doctype html><html><head><style>body{color:#111}</style></head><body><main>Production design</main></body></html>",
      wireframe,
      wireframeId: wireframe.id,
    });
    const task = createTask({
      id: 2,
      assets: [asset],
      content: "Implement the dashboard hierarchy.",
      designs: [design],
      title: "Build dashboard",
      wireframes: [wireframe],
    });
    const plan = createPlan({ id: 3, tasks: [task] });

    render(
      <ArtifactBrowser
        activeRelation="plans"
        context={createProjectContext({ plans: [plan], tasks: [task] })}
        selectedArtifactId={plan.id}
        selectedTaskId={task.id}
      />,
    );

    expect(screen.getByRole("heading", { name: "Task details" })).toBeInTheDocument();
    expect(screen.getByText("Implement the dashboard hierarchy.")).toBeInTheDocument();
    expect(screen.getByText("Icon Asset")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Wireframe")).toBeInTheDocument();
    expect(screen.getByText("Dashboard Design")).toBeInTheDocument();
    expect(screen.queryByTitle("Icon Asset HTML preview")).not.toBeInTheDocument();

    const assetTrigger = screen.getByRole("button", { name: /Icon Asset/ });
    fireEvent.click(assetTrigger);

    expect(
      screen.getByRole("complementary", { name: "Asset preview: Icon Asset" }),
    ).toBeInTheDocument();
    const assetPreview = screen.getByTitle("Icon Asset HTML preview");
    expect(assetPreview).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-Security-Policy"),
    );
    expect(assetPreview).toHaveAttribute("sandbox", "allow-scripts");
    expect(assetPreview).toHaveAttribute("referrerpolicy", "no-referrer");
    for (const directive of [
      "base-uri 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "object-src 'none'",
      "Logo and palette",
    ]) {
      expect(assetPreview.getAttribute("srcdoc")).toContain(directive);
    }
    const resizeHandle = screen.getByRole("separator", {
      name: "Resize HTML preview",
    });
    fireEvent.keyDown(resizeHandle, { key: "Home" });
    const minimumWidth = Number(resizeHandle.getAttribute("aria-valuenow"));

    fireEvent.keyDown(resizeHandle, { key: "ArrowLeft" });
    expect(Number(resizeHandle.getAttribute("aria-valuenow"))).toBeGreaterThan(
      minimumWidth,
    );

    const keyboardWidth = Number(resizeHandle.getAttribute("aria-valuenow"));
    fireEvent.pointerDown(resizeHandle, { clientX: 700, pointerId: 1 });
    fireEvent.pointerMove(resizeHandle, { clientX: 620, pointerId: 1 });
    expect(Number(resizeHandle.getAttribute("aria-valuenow"))).toBeGreaterThan(
      keyboardWidth,
    );
    fireEvent.pointerUp(resizeHandle, { pointerId: 1 });

    fireEvent.click(screen.getByRole("button", { name: "Close preview" }));
    expect(
      screen.queryByRole("complementary", { name: "Asset preview: Icon Asset" }),
    ).not.toBeInTheDocument();
    expect(assetTrigger).toHaveFocus();

    const designTrigger = screen.getByRole("button", {
      name: /Dashboard Design/,
    });
    fireEvent.click(designTrigger);
    expect(screen.getByTitle("Dashboard Design HTML preview")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Production design"),
    );
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByTitle("Dashboard Design HTML preview")).not.toBeInTheDocument();
    expect(designTrigger).toHaveFocus();
    expect(routerReplace).not.toHaveBeenCalled();
  });

  it("Workbench 검색과 상태 필터로 현재 record 목록을 좁힌다", () => {
    const current = createPlan({
      id: 11,
      title: "Current pipeline",
      version: 4,
    });
    const previous = createPlan({
      id: 12,
      title: "Previous pipeline",
      version: 3,
    });
    const context = createProjectContext({ plans: [current, previous] });

    render(
      <ArtifactBrowser
        activeRelation="plans"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(screen.getByText("2 visible")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search Plan records" }),
      { target: { value: "Previous" } },
    );

    expect(
      screen.queryByRole("button", { name: /Current pipeline/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Previous pipeline/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("1 visible")).toBeInTheDocument();

    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search Plan records" }),
      { target: { value: "" } },
    );
    fireEvent.change(screen.getByRole("combobox", { name: "Record status" }), {
      target: { value: "Current" },
    });

    expect(
      screen.getByRole("button", { name: /Current pipeline/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Previous pipeline/ }),
    ).not.toBeInTheDocument();
  });

  it("선택 record를 Metadata, Relations, Preview 탭으로 검사한다", () => {
    const asset = createAsset({ id: 71, title: "Workbench tokens" });
    const wireframe = createWireframe({
      id: 72,
      title: "Workbench flow",
    });
    const design = createDesign({
      id: 73,
      title: "Workbench UI",
      asset,
      assetId: asset.id,
      wireframe,
      wireframeId: wireframe.id,
    });

    render(
      <ArtifactBrowser
        activeRelation="designs"
        context={createProjectContext({
          assets: [asset],
          designs: [design],
          wireframes: [wireframe],
        })}
        selectedArtifactId={design.id}
        selectedTaskId={null}
      />,
    );

    const tabs = screen.getByRole("tablist", { name: "Record details" });
    expect(within(tabs).getByRole("tab", { name: "Metadata" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(within(tabs).getByRole("tab", { name: "Relations" }));
    expect(screen.getByText("Workbench tokens")).toBeInTheDocument();
    expect(screen.getByText("Workbench flow")).toBeInTheDocument();

    fireEvent.click(within(tabs).getByRole("tab", { name: "Preview" }));
    expect(
      screen.getByRole("button", { name: "Open Design preview" }),
    ).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ArtifactBrowser } from "./ArtifactBrowser";
import {
  createArtifact,
  createAsset,
  createDesign,
  createPlan,
  createProjectContext,
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

  it("선택한 Research의 로컬 empty 상태를 표시한다", () => {
    const context = Object.assign(createProjectContext(), {
      research: [createArtifact({ title: "Research 1" })],
    });

    render(
      <ArtifactBrowser
        activeRelation="research"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Research 1" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "No Research records" }),
    ).not.toBeInTheDocument();
  });

  it("선택 카테고리 count와 plan의 task 완료수를 렌더한다", () => {
    const completedTask = createTask({ id: 1, status: "COMPLETED" });
    const pendingTask = createTask({ id: 2, status: "PENDING" });
    const context = createProjectContext({
      plans: [
        createPlan({
          status: "IN_PROGRESS",
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
    expect(screen.getByText("1/2 Tasks completed")).toBeInTheDocument();
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
    const research = createArtifact({ id: 7, title: "Research focus target" });
    const context = Object.assign(createProjectContext(), {
      research: [research],
    });
    const { rerender } = render(
      <ArtifactBrowser
        activeRelation="research"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );
    const recordTrigger = screen.getByRole("button", {
      name: /Research focus target/,
    });

    recordTrigger.focus();
    fireEvent.click(recordTrigger);
    rerender(
      <ArtifactBrowser
        activeRelation="research"
        context={context}
        selectedArtifactId={research.id}
        selectedTaskId={null}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Back to list" }));
    rerender(
      <ArtifactBrowser
        activeRelation="research"
        context={context}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    expect(recordTrigger).toHaveFocus();
    expect(routerReplace).toHaveBeenLastCalledWith(
      "/projects/1?type=research",
      { scroll: false },
    );
  });

  it("Plan detail에서 Task를 선택하면 Task details URL로 이동한다", () => {
    const task = createTask({
      id: 2,
      title: "Build dashboard",
    });

    const plan = createPlan({
      id: 3,
      tasks: [task],
    });

    render(
      <ArtifactBrowser
        activeRelation="plans"
        context={createProjectContext({ plans: [plan], tasks: [task] })}
        selectedArtifactId={plan.id}
        selectedTaskId={null}
      />,
    );

    const planHeading = screen.getByRole("heading", { name: "Plan hierarchy" });
    expect(planHeading).toBeInTheDocument();
    expect(planHeading.closest("article")).toHaveTextContent("Pending");
    fireEvent.click(screen.getByRole("button", { name: /Build dashboard/ }));
    expect(routerReplace).toHaveBeenCalledWith(
      "/projects/1?type=plans&id=3&taskId=2",
      { scroll: false },
    );
  });

  it("Workbench 검색과 상태 필터로 현재 record 목록을 좁힌다", () => {
    const current = createPlan({
      id: 11,
      title: "Current pipeline",
      status: "IN_PROGRESS",
    });
    const previous = createPlan({
      id: 12,
      title: "Previous pipeline",
      status: "PENDING",
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
      target: { value: "In progress" },
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

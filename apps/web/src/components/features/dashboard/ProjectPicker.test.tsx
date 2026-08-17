import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  createProjectContext,
  createProjectSummary,
} from "@/test/fixtures/dashboard";
import type { ProjectSummary } from "@/types/dashboard";
import { ProjectPicker } from "./ProjectPicker";

/** 프로젝트별 title·repository 구성을 간결하게 만드는 picker fixture. */
function createProject(
  id: number,
  title: string,
  repositories: ProjectSummary["repoPaths"],
): ProjectSummary {
  return createProjectSummary(
    createProjectContext({ id, repoPaths: repositories, title }),
  );
}

describe("ProjectPicker", () => {
  it("단일 프로젝트는 열리지 않는 정적 현재 프로젝트 정보로 표시한다", () => {
    const project = createProject(1, "Yusung Harness", [
      { path: "/workspace/yusung-harness", repoType: "LOCAL" },
    ]);

    render(<ProjectPicker currentProjectId={1} projects={[project]} />);

    const currentProject = screen.getByLabelText(
      "Current project: Yusung Harness",
    );
    expect(currentProject).toHaveTextContent("Yusung Harness");
    expect(within(currentProject).getByText("YH")).toBeInTheDocument();
    expect(currentProject).toHaveTextContent("LOCAL");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("navigation", { name: "Projects" }),
    ).not.toBeInTheDocument();
  });

  it("프로젝트 link panel에 현재 표시, repository type badge와 multi-repo count를 제공한다", () => {
    const currentProject = createProject(1, "Yusung Harness", [
      { path: "/workspace/yusung-harness", repoType: "LOCAL" },
    ]);
    const mixedProject = createProject(
      2,
      "A very long remote platform project title that must not widen the viewport",
      [
        { path: "https://example.com/platform", repoType: "REMOTE" },
        { path: "/workspace/platform-docs", repoType: "LOCAL" },
      ],
    );

    render(
      <ProjectPicker
        currentProjectId={1}
        projects={[currentProject, mixedProject]}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Switch project. Current project: Yusung Harness",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveClass("min-h-11");
    expect(within(trigger).getByText("YH")).toBeInTheDocument();
    const triggerRepoType = within(trigger).getByText("LOCAL");
    expect(triggerRepoType.parentElement).toHaveClass("hidden", "md:flex");
    expect(triggerRepoType.parentElement).not.toHaveClass("xl:flex");
    expect(within(trigger).queryByText(/repos$/)).not.toBeInTheDocument();

    fireEvent.click(trigger);

    const menu = screen.getByRole("navigation", { name: "Projects" });
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(menu).toHaveClass("absolute");
    expect(menu).toHaveClass("w-[22.5rem]");
    expect(menu.className).not.toContain("w-[28rem]");
    expect(menu.className).toContain("max-w-[calc(100vw-1rem)]");
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();

    const currentLink = within(menu).getByRole("link", {
      name: /Yusung Harness/,
    });
    expect(currentLink).toHaveAttribute("href", "/projects/1");
    expect(currentLink).toHaveAttribute("aria-current", "page");
    const currentLabel = within(currentLink).getByText("Current project");
    expect(currentLabel).toHaveClass("sr-only");
    expect(currentLabel.parentElement).toHaveClass("text-sidebar-ink");
    expect(currentLabel.parentElement).not.toHaveClass("text-accent");

    const mixedLink = within(menu).getByRole("link", {
      name: /A very long remote platform project title/,
    });
    expect(mixedLink).toHaveAttribute("href", "/projects/2");
    expect(mixedLink).not.toHaveAttribute("aria-current");
    expect(within(mixedLink).getByText("REMOTE")).toBeInTheDocument();
    expect(within(mixedLink).getByText("LOCAL")).toBeInTheDocument();
    expect(within(mixedLink).getByText("2 repos")).toBeInTheDocument();
    expect(within(mixedLink).getByTitle(mixedProject.title)).toHaveClass(
      "line-clamp-2",
      "break-words",
    );
  });

  it("Arrow/Home/End로 link focus를 이동하고 Escape로 닫은 뒤 trigger focus를 복원한다", () => {
    const projects = [
      createProject(1, "Alpha", [
        { path: "/workspace/alpha", repoType: "LOCAL" },
      ]),
      createProject(2, "Beta", [
        { path: "/workspace/beta", repoType: "LOCAL" },
      ]),
      createProject(3, "Gamma", [
        { path: "https://example.com/gamma", repoType: "REMOTE" },
      ]),
    ];

    render(<ProjectPicker currentProjectId={2} projects={projects} />);

    const trigger = screen.getByRole("button", {
      name: "Switch project. Current project: Beta",
    });
    trigger.focus();
    fireEvent.click(trigger);

    let menu = screen.getByRole("navigation", { name: "Projects" });
    let items = within(menu).getAllByRole("link");
    const currentItem = items[1];
    if (!currentItem) {
      throw new Error("Expected current project link");
    }
    expect(currentItem).toHaveFocus();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "End" });
    expect(items[2]).toHaveFocus();
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    expect(items[0]).toHaveFocus();
    fireEvent.keyDown(items[0]!, { key: "Escape" });
    expect(
      screen.queryByRole("navigation", { name: "Projects" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();

    for (const key of ["Enter", " "]) {
      fireEvent.keyDown(trigger, { key });
      menu = screen.getByRole("navigation", { name: "Projects" });
      items = within(menu).getAllByRole("link");
      const activatedCurrentItem = items[1];
      if (!activatedCurrentItem) {
        throw new Error("Expected current project link after activation");
      }
      expect(activatedCurrentItem).toHaveFocus();
      fireEvent.keyDown(activatedCurrentItem, { key: "Escape" });
      expect(trigger).toHaveFocus();
    }

    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    menu = screen.getByRole("navigation", { name: "Projects" });
    items = within(menu).getAllByRole("link");
    const [firstItem, secondItem, thirdItem] =
      items;
    if (!firstItem || !secondItem || !thirdItem) {
      throw new Error("Expected three project menu items");
    }
    expect(firstItem).toHaveFocus();

    fireEvent.keyDown(firstItem, { key: "ArrowDown" });
    expect(secondItem).toHaveFocus();
    fireEvent.keyDown(secondItem, { key: "End" });
    expect(thirdItem).toHaveFocus();
    fireEvent.keyDown(thirdItem, { key: "Home" });
    expect(firstItem).toHaveFocus();
    fireEvent.keyDown(firstItem, { key: "ArrowUp" });
    expect(thirdItem).toHaveFocus();

    fireEvent.keyDown(thirdItem, { key: "Escape" });
    expect(
      screen.queryByRole("navigation", { name: "Projects" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("외부 pointerdown과 focus 이동 시 panel을 닫는다", () => {
    const projects = [
      createProject(1, "Alpha", [
        { path: "/workspace/alpha", repoType: "LOCAL" },
      ]),
      createProject(2, "Beta", [
        { path: "/workspace/beta", repoType: "LOCAL" },
      ]),
    ];

    render(
      <div>
        <ProjectPicker currentProjectId={1} projects={projects} />
        <button type="button">Outside control</button>
      </div>,
    );

    const trigger = screen.getByRole("button", {
      name: "Switch project. Current project: Alpha",
    });
    fireEvent.click(trigger);
    expect(
      screen.getByRole("navigation", { name: "Projects" }),
    ).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(
      screen.queryByRole("navigation", { name: "Projects" }),
    ).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(
      screen.getByRole("navigation", { name: "Projects" }),
    ).toBeInTheDocument();
    act(() => {
      screen.getByRole("button", { name: "Outside control" }).focus();
    });
    expect(
      screen.queryByRole("navigation", { name: "Projects" }),
    ).not.toBeInTheDocument();
  });
});

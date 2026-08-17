import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWorkspaceNavScroller } from "./ProjectWorkspaceNavScroller";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const scrollIntoView = vi.fn();

describe("ProjectWorkspaceNavScroller", () => {
  beforeEach(() => {
    scrollIntoView.mockClear();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
  });

  afterEach(() => {
    if (originalScrollIntoView) {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView,
      });
    } else {
      Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
    }
  });

  it("mount와 active relation 변경 때 후반 active tab을 nearest 위치로 reveal한다", () => {
    const items = [
      { count: 0, label: "Plan", relation: "plans" },
      { count: 2, label: "Research", relation: "research" },
      { count: 0, label: "Domain", relation: "domains" },
      { count: 1, label: "Architecture", relation: "architectures" },
      { count: 1, label: "Wireframe", relation: "wireframes" },
      { count: 1, label: "Asset", relation: "assets" },
      { count: 1, label: "Request", relation: "requests" },
    ] as const;
    const { rerender } = render(
      <ProjectWorkspaceNavScroller
        activeRelation="wireframes"
        items={items}
        projectId={1}
      />,
    );
    const wireframeLink = screen.getByRole("link", { name: "Wireframe 1" });
    const navigation = screen.getByRole("navigation", {
      name: "Project artifacts",
    });
    expect(
      screen.getByRole("link", { name: "Architecture 1" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Research 2" }),
    ).toHaveAttribute("href", "/projects/1?type=research");

    expect(navigation.querySelector(".overflow-x-auto")).toBeInTheDocument();
    expect(wireframeLink).toHaveAttribute("aria-current", "page");
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(wireframeLink);
    const mountCallCount = scrollIntoView.mock.calls.length;

    rerender(
      <ProjectWorkspaceNavScroller
        activeRelation="requests"
        items={items}
        projectId={1}
      />,
    );
    const requestLink = screen.getByRole("link", { name: "Request 1" });

    expect(requestLink).toHaveAttribute("aria-current", "page");
    expect(scrollIntoView.mock.calls.length).toBeGreaterThan(mountCallCount);
    expect(scrollIntoView).toHaveBeenLastCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(requestLink);
  });
});

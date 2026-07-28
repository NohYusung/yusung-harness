import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  createArchitecturePlan,
  createProjectContext,
  createProjectSummary,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe("Architecture Plan diagram tab", () => {
  it("content 문서를 기본 표시하고 구조도 탭에서 별도 html 칼럼을 렌더한다", () => {
    const architecturePlan = createArchitecturePlan({
      content:
        "<!doctype html><html><head><title>Plan content</title></head><body><main>Architecture plan content marker</main></body></html>",
      html: "<!doctype html><html><head><title>Plan diagram</title></head><body><main>Architecture diagram html marker</main></body></html>",
      id: 301,
      title: "Tabbed architecture plan",
    });
    const context = createProjectContext({
      architecturePlans: [architecturePlan],
    });

    render(
      <Dashboard
        activeRelation="architecturePlans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={architecturePlan.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: architecturePlan.title,
    });
    const viewTabs = within(detailPane).getByRole("tablist", {
      name: "Architecture Plan views",
    });
    const contentTab = within(viewTabs).getByRole("tab", { name: "Content" });
    const diagramTab = within(viewTabs).getByRole("tab", { name: "구조도" });

    expect(contentTab).toHaveAttribute("aria-selected", "true");
    expect(diagramTab).toHaveAttribute("aria-selected", "false");

    let activePanel = within(detailPane).getByRole("tabpanel");
    let previewFrame = activePanel.querySelector("iframe");

    expect(previewFrame).not.toBeNull();
    expect(previewFrame).toHaveAttribute("sandbox", "allow-scripts");
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Architecture plan content marker"),
    );
    expect(previewFrame).not.toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Architecture diagram html marker"),
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-Security-Policy"),
    );

    fireEvent.click(diagramTab);

    expect(contentTab).toHaveAttribute("aria-selected", "false");
    expect(diagramTab).toHaveAttribute("aria-selected", "true");

    activePanel = within(detailPane).getByRole("tabpanel");
    previewFrame = activePanel.querySelector("iframe");

    expect(previewFrame).not.toBeNull();
    expect(previewFrame).toHaveAttribute("sandbox", "allow-scripts");
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Architecture diagram html marker"),
    );
    expect(previewFrame).not.toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Architecture plan content marker"),
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-Security-Policy"),
    );
  });

  it("html 칼럼이 비어도 구조도 탭을 유지하고 content로 대체하지 않는다", () => {
    const architecturePlan = createArchitecturePlan({
      content:
        "<!doctype html><html><head><title>Plan only</title></head><body><main>Content-only architecture plan marker</main></body></html>",
      html: "",
      id: 302,
      title: "Architecture plan without diagram",
    });
    const context = createProjectContext({
      architecturePlans: [architecturePlan],
    });

    render(
      <Dashboard
        activeRelation="architecturePlans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={architecturePlan.id}
        selectedTaskId={null}
      />,
    );

    const detailPane = screen.getByRole("complementary", {
      name: architecturePlan.title,
    });
    const viewTabs = within(detailPane).getByRole("tablist", {
      name: "Architecture Plan views",
    });
    const diagramTab = within(viewTabs).getByRole("tab", { name: "구조도" });
    const contentPreview = within(detailPane)
      .getByRole("tabpanel")
      .querySelector("iframe");

    expect(contentPreview).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-only architecture plan marker"),
    );

    fireEvent.click(diagramTab);

    expect(diagramTab).toHaveAttribute("aria-selected", "true");
    expect(
      within(detailPane).getByRole("tabpanel").querySelector("iframe"),
    ).toBeNull();
  });
});

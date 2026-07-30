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
  it("Content 탭은 GFM Markdown을 의미 요소로 렌더하고 구조도 탭은 별도 html iframe을 유지한다", () => {
    const architecturePlan = createArchitecturePlan({
      content: `# 배포 아키텍처

| 계층 | 책임 |
| --- | --- |
| GitHub Actions | 정적 산출물 검증 |
| GitHub Pages | HTTPS 배포 |

- Markdown 설명을 표시한다.
- 별도 HTML 구조도를 유지한다.

\`\`\`text
Repository -> Actions -> Pages
\`\`\`

<button id="unsafe-markup" onclick="window.__unsafeMarkdownExecuted = true">Unsafe button</button>
<script>window.__unsafeMarkdownExecuted = true</script>`,
      html: "<!doctype html><html><head><title>Plan diagram</title></head><body><main>Architecture diagram html marker</main></body></html>",
      id: 301,
      title: "Tabbed architecture plan",
    });
    const context = createProjectContext({
      architecturePlans: [architecturePlan],
    });

    const { container } = render(
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
    expect(activePanel.querySelector("iframe")).toBeNull();
    expect(
      within(activePanel).getByRole("heading", {
        level: 1,
        name: "배포 아키텍처",
      }),
    ).toBeInTheDocument();
    const architectureTable = within(activePanel).getByRole("table");

    expect(
      within(architectureTable).getByRole("columnheader", { name: "계층" }),
    ).toBeInTheDocument();
    expect(
      within(architectureTable).getByRole("cell", { name: "GitHub Pages" }),
    ).toBeInTheDocument();
    const architectureList = within(activePanel).getByRole("list");

    expect(within(architectureList).getAllByRole("listitem")).toHaveLength(2);
    expect(activePanel.querySelector("pre code")).toHaveTextContent(
      "Repository -> Actions -> Pages",
    );
    expect(activePanel).not.toHaveTextContent("# 배포 아키텍처");
    expect(activePanel).not.toHaveTextContent("| 계층 | 책임 |");
    expect(container.querySelector("#unsafe-markup")).toBeNull();
    expect(container.querySelector("script")).toBeNull();

    fireEvent.click(diagramTab);

    expect(contentTab).toHaveAttribute("aria-selected", "false");
    expect(diagramTab).toHaveAttribute("aria-selected", "true");

    activePanel = within(detailPane).getByRole("tabpanel");
    const previewFrame = activePanel.querySelector("iframe");

    expect(previewFrame).not.toBeNull();
    expect(previewFrame).toHaveAttribute("sandbox", "allow-scripts");
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Architecture diagram html marker"),
    );
    expect(previewFrame).not.toHaveAttribute(
      "srcdoc",
      expect.stringContaining("# 배포 아키텍처"),
    );
    expect(previewFrame).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Content-Security-Policy"),
    );
  });

  it("content가 비어 있으면 fallback을 표시하고 구조도 탭은 저장된 html을 계속 렌더한다", () => {
    const architecturePlan = createArchitecturePlan({
      content: "  \n  ",
      html: "<!doctype html><html><head><title>Fallback diagram</title></head><body><main>Fallback architecture diagram marker</main></body></html>",
      id: 302,
      title: "Architecture plan without content",
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
    let activePanel = within(detailPane).getByRole("tabpanel");

    expect(activePanel.querySelector("iframe")).toBeNull();
    expect(
      within(activePanel).getByText("No content has been saved yet."),
    ).toBeInTheDocument();

    fireEvent.click(diagramTab);

    activePanel = within(detailPane).getByRole("tabpanel");
    expect(activePanel.querySelector("iframe")).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Fallback architecture diagram marker"),
    );
  });

  it("html 칼럼이 비어도 구조도 탭을 유지하고 content로 대체하지 않는다", () => {
    const architecturePlan = createArchitecturePlan({
      content: "# Content-only architecture plan marker",
      html: "",
      id: 303,
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
    const contentPanel = within(detailPane).getByRole("tabpanel");

    expect(contentPanel.querySelector("iframe")).toBeNull();
    expect(
      within(contentPanel).getByRole("heading", {
        level: 1,
        name: "Content-only architecture plan marker",
      }),
    ).toBeInTheDocument();

    fireEvent.click(diagramTab);

    expect(diagramTab).toHaveAttribute("aria-selected", "true");
    expect(
      within(detailPane).getByRole("tabpanel").querySelector("iframe"),
    ).toBeNull();
    expect(
      within(detailPane).getByText("저장된 구조도가 없습니다"),
    ).toBeInTheDocument();
  });
});

import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArtifact,
  createErdScene,
  createProjectContext,
  createProjectSummary,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const routerReplace = vi.hoisted(() => vi.fn());
const excalidrawMocks = vi.hoisted(() => ({
  loadFromBlob: vi.fn(),
  render: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
    replace: routerReplace,
  }),
}));

vi.mock("next/dynamic", () => ({
  default: () =>
    function MockExcalidraw(props: unknown) {
      excalidrawMocks.render(props);
      return <div data-testid="project-record-excalidraw" />;
    },
}));

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: () => null,
  loadFromBlob: excalidrawMocks.loadFromBlob,
}));

const architecturePlanContent = "# Architecture plan content marker";
const architecturePlanHtml =
  "<!doctype html><html><head><title>Architecture diagram</title></head><body><main>Architecture diagram preview marker</main></body></html>";
const erdScene = JSON.stringify(createErdScene());

function createProjectRecordContext() {
  return Object.assign(createProjectContext(), {
    workLogs: [
      createArtifact({
        content: "First implementation log marker",
        id: 101,
        title: "Implement project record navigation",
      }),
      createArtifact({
        content: "Second implementation log marker",
        id: 102,
        title: "Verify project record navigation",
      }),
    ],
    architecturePlans: [
      {
        ...createArtifact({
          content: architecturePlanContent,
          id: 201,
          title: "Project navigation architecture",
        }),
        html: architecturePlanHtml,
      },
    ],
    databases: [
      createArtifact({
        content: "Database schema marker one",
        id: 301,
        title: "Primary database schema",
      }),
      createArtifact({
        content: "Database schema marker two",
        id: 302,
        title: "Audit database schema",
      }),
    ],
    erds: [
      {
        id: 401,
        projectId: 1,
        createdAt: "2026-07-18T01:00:00.000Z",
        updatedAt: "2026-07-18T02:00:00.000Z",
        title: "Project database ERD",
        scene: erdScene,
      },
    ],
  });
}

const navigationCases = [
  {
    count: 2,
    detailType: "WorkLog",
    id: 101,
    label: "WorkLogs",
    relation: "workLogs",
    title: "Implement project record navigation",
  },
  {
    count: 1,
    detailType: "Architecture Plan",
    id: 201,
    label: "Architecture Plan",
    relation: "architecturePlans",
    title: "Project navigation architecture",
  },
  {
    count: 2,
    detailType: "DB",
    id: 301,
    label: "DB",
    relation: "databases",
    title: "Primary database schema",
  },
  {
    count: 1,
    detailType: "ERD",
    id: 401,
    label: "ERD",
    relation: "erds",
    title: "Project database ERD",
  },
] as const;

describe("Project record navigation", () => {
  beforeEach(() => {
    routerReplace.mockClear();
    excalidrawMocks.loadFromBlob.mockReset();
    excalidrawMocks.render.mockReset();
    excalidrawMocks.loadFromBlob.mockResolvedValue({
      appState: {},
      elements: [{ id: "restored-erd", type: "rectangle" }],
      files: {},
    });
  });

  it.each(navigationCases)(
    "$label 탭은 실제 count, 해당 record 목록, 선택 URL과 $detailType type을 연결한다",
    ({ count, detailType, id, label, relation, title }) => {
      const context = createProjectRecordContext();

      render(
        <Dashboard
          activeRelation="plans"
          context={context}
          projects={[createProjectSummary(context)]}
          selectedArtifactId={null}
          selectedTaskId={null}
        />,
      );

      const navigation = screen.getByRole("navigation", {
        name: "Artifact types",
      });
      const menu = within(navigation).getByRole("button", {
        name: new RegExp(`^${label}\\s*${count}$`),
      });

      expect(menu).toHaveAttribute("aria-pressed", "false");
      fireEvent.click(menu);

      expect(menu).toHaveAttribute("aria-pressed", "true");
      expect(routerReplace).toHaveBeenLastCalledWith(
        `/projects/1?type=${relation}`,
        { scroll: false },
      );

      const records = screen.getByRole("listbox", {
        name: "Artifact records",
      });
      const rows = within(records).getAllByRole("option");
      expect(rows).toHaveLength(count);

      const record = within(records).getByRole("option", {
        name: new RegExp(`^Type ${detailType}, No ${id}, Title ${title},`),
      });
      fireEvent.click(record);

      expect(routerReplace).toHaveBeenLastCalledWith(
        `/projects/1?type=${relation}&id=${id}`,
        { scroll: false },
      );
      const detail = screen.getByRole("complementary", { name: title });
      expect(
        within(detail).getByText(detailType, { selector: "dd" }),
      ).toBeInTheDocument();
    },
  );

  it("Markdown detail과 Architecture Plan 탭, iframe 없는 ERD Excalidraw preview를 렌더한다", async () => {
    const context = createProjectRecordContext();

    render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={null}
      />,
    );

    for (const { label, marker, title } of [
      {
        label: "WorkLogs",
        marker: "First implementation log marker",
        title: "Implement project record navigation",
      },
      {
        label: "DB",
        marker: "Database schema marker one",
        title: "Primary database schema",
      },
    ]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(label) }));
      fireEvent.click(screen.getByRole("option", { name: new RegExp(title) }));
      expect(
        within(
          screen.getByRole("complementary", { name: title }),
        ).getByText(marker),
      ).toBeInTheDocument();
    }

    fireEvent.click(
      screen.getByRole("button", { name: /Architecture Plan/ }),
    );
    fireEvent.click(
      screen.getByRole("option", { name: /Project navigation architecture/ }),
    );
    const architectureDetail = screen.getByRole("complementary", {
      name: "Project navigation architecture",
    });

    expect(
      within(architectureDetail).getByRole("heading", {
        level: 1,
        name: "Architecture plan content marker",
      }),
    ).toBeInTheDocument();
    expect(
      within(architectureDetail).queryByTitle(
        "Project navigation architecture HTML preview",
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(
      within(architectureDetail).getByRole("tab", { name: "구조도" }),
    );

    expect(
      within(architectureDetail).getByTitle(
        "Project navigation architecture HTML preview",
      ),
    ).toHaveAttribute(
      "srcdoc",
      expect.stringContaining("Architecture diagram preview marker"),
    );

    fireEvent.click(screen.getByRole("button", { name: /ERD/ }));
    fireEvent.click(
      screen.getByRole("option", { name: /Project database ERD/ }),
    );
    expect(
      await screen.findByRole("region", {
        name: "Project database ERD ERD preview",
      }),
    ).toContainElement(screen.getByTestId("project-record-excalidraw"));
    expect(
      screen.queryByTitle(/Project database ERD HTML preview/),
    ).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(excalidrawMocks.loadFromBlob).toHaveBeenCalledTimes(1);
  });
});

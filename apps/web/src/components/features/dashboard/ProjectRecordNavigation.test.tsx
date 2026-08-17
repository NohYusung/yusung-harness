import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createArtifact,
  createErdDocument,
  createPlan,
  createProjectContext,
  createProjectSummary,
  createReview,
  createTask,
} from "@/test/fixtures/dashboard";
import { Dashboard } from "./Dashboard";

const routerReplace = vi.hoisted(() => vi.fn());
const dineugMocks = vi.hoisted(() => ({
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
    function MockDineugCanvas(props: {
      document: unknown;
      recordId: number;
      title: string;
    }) {
      dineugMocks.render(props);
      return (
        <div
          aria-label={`${props.title} ERD preview`}
          data-testid="project-record-dineug"
          role="region"
        />
      );
    },
}));

vi.mock("@dineug/erd-editor", () => ({}));

const architecturePlanContent = "# Architecture plan content marker";
const architecturePlanHtml =
  "<!doctype html><html><head><title>Architecture diagram</title></head><body><main>Architecture diagram preview marker</main></body></html>";
const erdDocument = JSON.stringify(createErdDocument());

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
    architectures: [
      {
        ...createArtifact({
          content: architecturePlanContent,
          id: 201,
          title: "Project navigation architecture",
        }),
        html: architecturePlanHtml,
        type: "PLAN" as const,
      },
      {
        ...createArtifact({
          content: "Current architecture marker",
          id: 202,
          title: "Current project architecture",
        }),
        html: "",
        type: "PRODUCTION" as const,
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
        document: erdDocument,
      },
    ],
    reviews: [
      createReview({
        content: "Project review marker",
        id: 501,
        title: "Project status review",
      }),
    ],
  });
}

/** Review가 다른 Plan의 유효 Task ID를 선택 상태로 오인하지 않는 fixture. */
function createProjectRecordContextWithForeignTask() {
  const task = createTask({
    content: "Foreign Plan Task detail marker",
    id: 701,
    planId: 700,
    title: "Foreign Plan Task",
  });
  const plan = createPlan({
    id: 700,
    tasks: [task],
    title: "Foreign Plan",
  });
  const context = {
    ...createProjectRecordContext(),
    plans: [plan],
    tasks: [task],
  };

  return { context, plan, task };
}

const navigationCases = [
  {
    count: 2,
    architectureView: null,
    detailType: "WorkLog",
    id: 101,
    label: "WorkLogs",
    relation: "workLogs",
    title: "Implement project record navigation",
  },
  {
    count: 1,
    architectureView: "plan",
    detailType: "Architecture",
    id: 201,
    label: "Architecture Plan",
    relation: "architectures",
    title: "Project navigation architecture",
  },
  {
    count: 1,
    architectureView: "current",
    detailType: "Architecture",
    id: 202,
    label: "Current Architecture",
    relation: "architectures",
    title: "Current project architecture",
  },
  {
    count: 2,
    architectureView: null,
    detailType: "DB",
    id: 301,
    label: "DB",
    relation: "databases",
    title: "Primary database schema",
  },
  {
    count: 1,
    architectureView: null,
    detailType: "ERD",
    id: 401,
    label: "ERD",
    relation: "erds",
    title: "Project database ERD",
  },
  {
    count: 1,
    architectureView: null,
    detailType: "Review",
    id: 501,
    label: "Reviews",
    relation: "reviews",
    title: "Project status review",
  },
] as const;

describe("Project record navigation", () => {
  beforeEach(() => {
    routerReplace.mockClear();
    dineugMocks.render.mockReset();
  });

  it.each(navigationCases)(
    "$label 탭은 실제 count, 해당 record 목록, 선택 URL과 $detailType type을 연결한다",
    ({ architectureView, count, detailType, id, label, relation, title }) => {
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
      /** Architecture는 물리 record ID 대신 내부 view를 canonical URL로 사용한다. */
      const expectedWorkspaceUrl = architectureView
        ? `/projects/1?type=architectures&view=${architectureView}`
        : `/projects/1?type=${relation}`;
      expect(routerReplace).toHaveBeenLastCalledWith(
        expectedWorkspaceUrl,
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

      const expectedRecordUrl = architectureView
        ? `/projects/1?type=architectures&view=${architectureView}`
        : `/projects/1?type=${relation}&id=${id}`;
      expect(routerReplace).toHaveBeenLastCalledWith(
        expectedRecordUrl,
        { scroll: false },
      );
      const detail = screen.getByRole("complementary", { name: title });
      expect(
        within(detail).getByText(detailType, { selector: "dd" }),
      ).toBeInTheDocument();
    },
  );

  it("Review 직접 진입은 독립 workspace 선택과 Markdown detail을 복원한다", () => {
    const { context, task } = createProjectRecordContextWithForeignTask();

    render(
      <Dashboard
        activeRelation="reviews"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={501}
        selectedTaskId={task.id}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Reviews 1" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("option", { name: /Project status review/ }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(
        screen.getByRole("complementary", {
          name: "Project status review",
        }),
      ).getByText("Project review marker"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Foreign Plan Task detail marker"),
    ).not.toBeInTheDocument();
  });

  it("stale Review ID는 첫 Review로 대체하지 않고 명시적인 not-found 상태를 표시한다", () => {
    const { context, task } = createProjectRecordContextWithForeignTask();

    render(
      <Dashboard
        activeRelation="reviews"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={999}
        selectedTaskId={task.id}
      />,
    );

    const reviewRow = screen.getByRole("option", {
      name: /Project status review/,
    });
    const detail = screen.getByRole("complementary", {
      name: "Review not found",
    });

    expect(reviewRow).toHaveAttribute("aria-selected", "false");
    expect(
      within(detail).getByRole("region", { name: "Review selection state" }),
    ).toHaveTextContent("Review #999");
    expect(
      within(detail).queryByText("Project review marker"),
    ).not.toBeInTheDocument();
    expect(within(detail).queryByText(task.title)).not.toBeInTheDocument();
  });

  it("빈 Review workspace는 다른 relation의 record를 detail fallback으로 사용하지 않는다", () => {
    const { context: contextWithReview, task } =
      createProjectRecordContextWithForeignTask();
    const context = {
      ...contextWithReview,
      reviews: [],
    };

    render(
      <Dashboard
        activeRelation="reviews"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={null}
        selectedTaskId={task.id}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Reviews 0" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("No Review records")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Review selection state" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Foreign Plan Task detail marker"),
    ).not.toBeInTheDocument();
  });

  it("Plan 내부 Task deep link는 같은 selectedTaskId의 기존 detail을 유지한다", () => {
    const { context, plan, task } = createProjectRecordContextWithForeignTask();

    render(
      <Dashboard
        activeRelation="plans"
        context={context}
        projects={[createProjectSummary(context)]}
        selectedArtifactId={plan.id}
        selectedTaskId={task.id}
      />,
    );

    const detail = screen.getByRole("complementary", { name: task.title });
    expect(
      within(detail).getByText("Foreign Plan Task detail marker"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: new RegExp(task.title) }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("Markdown detail과 Architecture Plan 탭, iframe 없는 ERD Dineug preview를 렌더한다", async () => {
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
      screen.getByRole("button", { name: /^Architecture Plan\s*1$/ }),
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
    ).toBe(screen.getByTestId("project-record-dineug"));
    expect(
      screen.queryByTitle(/Project database ERD HTML preview/),
    ).not.toBeInTheDocument();
    expect(document.querySelector("iframe")).toBeNull();
    expect(dineugMocks.render).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: 401,
        title: "Project database ERD",
      }),
    );
  });
});

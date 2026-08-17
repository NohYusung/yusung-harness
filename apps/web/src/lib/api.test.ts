import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlans, getProjectDashboard, getProjects, getTasks } from "@/lib/api";
import {
  createArtifact,
  createErd,
  createProjectContext,
  createProjectSummary,
} from "@/test/fixtures/dashboard";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("dashboard API helpers", () => {
  it("프로젝트 목록은 REST list API의 data envelope를 반환한다", async () => {
    const context = createProjectContext();
    const projects = [createProjectSummary(context)];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: projects }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(getProjects()).resolves.toEqual(projects);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/projects",
      { cache: "no-store" },
    );
  });

  it("프로젝트 목록 REST 오류는 HTTP status를 보존한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("temporarily unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(getProjects()).rejects.toMatchObject({
      name: "HarnessApiError",
      status: 503,
    });
  });

  it("Plan 목록은 versionOrder 없이 REST API에 요청한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(getPlans(7)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/plans/7",
      { cache: "no-store" },
    );
  });

  it("Task 목록은 선택한 project와 plan 범위의 REST API에 요청한다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(getTasks(7, 13)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/tasks/7/13",
      { cache: "no-store" },
    );
  });

  it("선택한 Plan 대시보드는 project 목록과 plan-scoped Task REST list를 병렬 조립한다", async () => {
    const context = createProjectContext({ id: 7 });
    const projects = [createProjectSummary(context)];
    const relationResponses = [
      context.plans,
      context.tasks,
      context.drafts,
      context.domains,
      context.architectures,
      context.wireframes,
      context.assets,
      context.reviews,
      context.requests,
      context.workLogs,
      context.architecturePlans,
      context.databases,
      context.erds,
    ];

    for (const data of [projects, ...relationResponses]) {
      fetchMock.mockResolvedValueOnce(
        new Response(JSON.stringify({ data }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
      );
    }

    await expect(getProjectDashboard(7, 13)).resolves.toEqual({
      projects,
      context,
    });
    expect(fetchMock.mock.calls).toEqual(
      [
        "/projects",
        "/plans/7",
        "/tasks/7/13",
        "/drafts/7",
        "/domains/7",
        "/architectures/7",
        "/wireframes/7",
        "/assets/7",
        "/reviews/7",
        "/requests/7",
        "/worklogs/7",
        "/architecture-plans/7",
        "/db/7",
        "/erd/7",
      ].map((path) => [
        `http://127.0.0.1:4000${path}`,
        { cache: "no-store" },
      ]),
    );
    expect("_count" in context).toBe(false);
  });

  it("project dashboard는 WorkLogs, Architecture Plan, DB, ERD REST 목록을 실제 context에 조립한다", async () => {
    const architecturePlanHtml =
      "<!doctype html><html><head><title>Architecture plan</title></head><body><main>Architecture plan from content</main></body></html>";
    const context = Object.assign(createProjectContext({ id: 1 }), {
      workLogs: [
        createArtifact({ id: 101, title: "Implementation work log" }),
      ],
      architecturePlans: [
        {
          ...createArtifact({
            content: architecturePlanHtml,
            id: 201,
            title: "Project architecture plan",
          }),
          html: "",
        },
      ],
      databases: [
        createArtifact({ id: 301, title: "Project database schema" }),
      ],
      erds: [createErd({ id: 401, title: "Project database ERD" })],
    });
    const project = createProjectSummary(context);
    Object.assign(project._count, {
      workLogs: context.workLogs.length,
      architecturePlans: context.architecturePlans.length,
      databases: context.databases.length,
      erds: context.erds.length,
    });
    const dataByPath: Record<string, unknown[]> = {
      "/projects": [project],
      "/plans/1": context.plans,
      "/drafts/1": context.drafts,
      "/domains/1": context.domains,
      "/architectures/1": context.architectures,
      "/wireframes/1": context.wireframes,
      "/assets/1": context.assets,
      "/reviews/1": context.reviews,
      "/requests/1": context.requests,
      "/worklogs/1": context.workLogs,
      "/architecture-plans/1": context.architecturePlans,
      "/db/1": context.databases,
      "/erd/1": context.erds,
    };

    fetchMock.mockImplementation(async (input) => {
      const path = new URL(String(input)).pathname;
      const data = dataByPath[path];

      if (!data) {
        throw new Error(`Unexpected dashboard request: ${path}`);
      }

      return new Response(JSON.stringify({ data }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    const dashboard = await getProjectDashboard(1);

    expect(dashboard.context).toMatchObject({
      workLogs: context.workLogs,
      architecturePlans: context.architecturePlans,
      databases: context.databases,
      erds: context.erds,
    });
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual(
      expect.arrayContaining([
        "http://127.0.0.1:4000/worklogs/1",
        "http://127.0.0.1:4000/architecture-plans/1",
        "http://127.0.0.1:4000/db/1",
        "http://127.0.0.1:4000/erd/1",
      ]),
    );
  });

  it("산출물 list REST 오류는 HTTP status를 보존한다", async () => {
    const context = createProjectContext({ id: 7 });
    const projects = [createProjectSummary(context)];
    const responses = [
      new Response(JSON.stringify({ data: projects }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
      new Response("project unavailable", {
        status: 502,
        statusText: "Bad Gateway",
      }),
      ...Array.from(
        { length: 13 },
        () =>
          new Response(JSON.stringify({ data: [] }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      ),
    ];
    for (const response of responses) fetchMock.mockResolvedValueOnce(response);

    await expect(getProjectDashboard(7, 13)).rejects.toMatchObject({
      name: "HarnessApiError",
      status: 502,
    });
  });

  it("잘못된 projectId는 REST 요청 전에 거부한다", async () => {
    await expect(getProjectDashboard(0)).rejects.toThrow("Invalid project ID: 0");
    await expect(getProjectDashboard(1.5)).rejects.toThrow(
      "Invalid project ID: 1.5",
    );
    await expect(
      getProjectDashboard(Number.MAX_SAFE_INTEGER + 1),
    ).rejects.toThrow(`Invalid project ID: ${Number.MAX_SAFE_INTEGER + 1}`);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

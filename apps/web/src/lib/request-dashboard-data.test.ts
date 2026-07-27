import { beforeEach, describe, expect, it, vi } from "vitest";
import { getProjectDashboard, getRequests } from "@/lib/api";
import { requestListResponseSchema } from "@/lib/validations/dashboard";
import {
  createProjectContext,
  createProjectSummary,
  createRequest,
} from "@/test/fixtures/dashboard";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("Request dashboard data contract", () => {
  it("Request 목록 schema는 lifecycle status를 검증하고 보존한다", () => {
    for (const status of ["PENDING", "IN_PROGRESS", "COMPLETED"] as const) {
      expect(
        requestListResponseSchema.parse({
          data: [createRequest({ status })],
        }).data[0],
      ).toMatchObject({ status });
    }

    for (const invalidStatus of [undefined, "DONE", 1]) {
      const payload: unknown = {
        data: [{ ...createRequest(), status: invalidStatus }],
      };

      expect(
        requestListResponseSchema.safeParse(payload).success,
      ).toBe(false);
    }
  });

  it("getRequests는 project-scoped Request REST 목록을 조회한다", async () => {
    const request = createRequest({ id: 101, title: "Add Request menu" });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: [request] }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(getRequests(7)).resolves.toEqual([request]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/requests/7",
      { cache: "no-store" },
    );
  });

  it("getProjectDashboard는 Request 목록을 다른 project record와 병렬 조립한다", async () => {
    const request = createRequest({
      id: 101,
      projectId: 7,
      status: "IN_PROGRESS",
      title: "Expose requests in the workbench",
    });
    const context = createProjectContext({ id: 7, requests: [request] });
    const projects = [createProjectSummary(context)];

    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      const data = url.endsWith("/projects")
        ? projects
        : url.endsWith("/requests/7")
          ? [request]
          : [];

      return new Response(JSON.stringify({ data }), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });

    await expect(getProjectDashboard(7, 13)).resolves.toEqual({
      projects,
      context,
    });
    expect(
      fetchMock.mock.calls.map(([input]) => String(input)),
    ).toContain("http://127.0.0.1:4000/requests/7");
    expect(fetchMock).toHaveBeenCalledTimes(15);
  });
});

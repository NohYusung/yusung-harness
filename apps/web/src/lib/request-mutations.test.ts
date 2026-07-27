import { beforeEach, describe, expect, it, vi } from "vitest";
import { createRequest, updateRequest } from "@/lib/api";
import { createRequest as createRequestRecord } from "@/test/fixtures/dashboard";

vi.mock("server-only", () => ({}));

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("Request mutation API helpers", () => {
  it("createRequest는 project-scoped POST body를 전송하고 생성된 Request를 반환한다", async () => {
    const created = createRequestRecord({
      content: "Keep the central request document editable.",
      id: 101,
      projectId: 7,
      title: "Add request document",
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: created }), {
        headers: { "content-type": "application/json" },
        status: 201,
      }),
    );

    await expect(
      createRequest(7, {
        title: created.title,
        content: created.content,
      }),
    ).resolves.toEqual(created);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/requests/7",
      {
        body: JSON.stringify({
          title: created.title,
          content: created.content,
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "POST",
      },
    );
  });

  it("updateRequest는 project/request-scoped PUT body를 전송하고 수정된 Request를 반환한다", async () => {
    const updated = createRequestRecord({
      content: "Persist title, content, and lifecycle status.",
      id: 101,
      projectId: 7,
      status: "IN_PROGRESS",
      title: "Edit request document",
    });
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ data: updated }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );

    await expect(
      updateRequest(7, 101, {
        title: updated.title,
        content: updated.content,
        status: updated.status,
      }),
    ).resolves.toEqual(updated);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4000/requests/7/101",
      {
        body: JSON.stringify({
          title: updated.title,
          content: updated.content,
          status: updated.status,
        }),
        cache: "no-store",
        headers: { "content-type": "application/json" },
        method: "PUT",
      },
    );
  });

  it("mutation HTTP 오류는 status를 보존하고 기존 응답처럼 성공 처리하지 않는다", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("request write unavailable", {
        status: 503,
        statusText: "Service Unavailable",
      }),
    );

    await expect(
      createRequest(7, { title: "Unavailable", content: "Retry later." }),
    ).rejects.toMatchObject({
      name: "HarnessApiError",
      status: 503,
    });
  });

  it("잘못된 project/request ID는 mutation REST 요청 전에 거부한다", async () => {
    await expect(
      createRequest(0, { title: "Invalid", content: "Invalid project." }),
    ).rejects.toThrow("Invalid project ID: 0");
    await expect(
      updateRequest(7, 0, {
        title: "Invalid",
        content: "Invalid request.",
        status: "PENDING",
      }),
    ).rejects.toThrow("Invalid request ID: 0");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

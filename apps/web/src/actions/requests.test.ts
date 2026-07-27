import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRequest as createRequestApi,
  updateRequest as updateRequestApi,
} from "@/lib/api";
import { createRequest as createRequestRecord } from "@/test/fixtures/dashboard";
import { createRequestAction, updateRequestAction } from "./requests";

vi.mock("@/lib/api", () => ({
  createRequest: vi.fn(),
  updateRequest: vi.fn(),
}));

const createRequestMock = vi.mocked(createRequestApi);
const updateRequestMock = vi.mocked(updateRequestApi);

beforeEach(() => {
  createRequestMock.mockReset();
  updateRequestMock.mockReset();
});

describe("Request Server Actions", () => {
  it("createRequestAction은 입력을 REST helper에 전달하고 직렬화 가능한 성공 결과를 반환한다", async () => {
    const request = createRequestRecord({
      content: "Create through the Request controller.",
      id: 101,
      projectId: 7,
      title: "Create request",
    });
    createRequestMock.mockResolvedValueOnce(request);

    await expect(
      createRequestAction(7, {
        title: request.title,
        content: request.content,
      }),
    ).resolves.toEqual({ ok: true, request });
    expect(createRequestMock).toHaveBeenCalledWith(7, {
      title: request.title,
      content: request.content,
    });
  });

  it("updateRequestAction은 status를 포함한 입력을 REST helper에 전달한다", async () => {
    const request = createRequestRecord({
      content: "Update through the Request controller.",
      id: 101,
      projectId: 7,
      status: "COMPLETED",
      title: "Update request",
    });
    updateRequestMock.mockResolvedValueOnce(request);

    await expect(
      updateRequestAction(7, request.id, {
        title: request.title,
        content: request.content,
        status: request.status,
      }),
    ).resolves.toEqual({ ok: true, request });
    expect(updateRequestMock).toHaveBeenCalledWith(7, request.id, {
      title: request.title,
      content: request.content,
      status: request.status,
    });
  });

  it("REST 오류를 throw하지 않고 편집기가 표시할 실패 결과로 변환한다", async () => {
    createRequestMock.mockRejectedValueOnce(new Error("API unavailable"));

    await expect(
      createRequestAction(7, {
        title: "Retry request",
        content: "Keep the editor open.",
      }),
    ).resolves.toEqual({ ok: false, message: "API unavailable" });
  });
});

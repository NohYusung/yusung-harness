"use server";

import {
  createRequest,
  updateRequest,
} from "@/lib/api";
import type {
  CreateRequestInput,
  Request,
  UpdateRequestInput,
} from "@/types/dashboard";

/** Request 편집기가 직렬화 가능한 형태로 받는 mutation 결과. */
export type RequestActionResult =
  | { ok: true; request: Request }
  | { ok: false; message: string };

/** 알 수 없는 REST 오류를 사용자에게 표시할 수 있는 설명으로 좁힌다. */
function getRequestActionErrorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "The request could not be saved.";
}

/** Client 편집기에서 새 Request 문서를 생성하는 Server Action. */
export async function createRequestAction(
  projectId: number,
  input: CreateRequestInput,
): Promise<RequestActionResult> {
  try {
    const request = await createRequest(projectId, input);
    return { ok: true, request };
  } catch (error: unknown) {
    return { ok: false, message: getRequestActionErrorMessage(error) };
  }
}

/** Client 편집기에서 기존 Request 문서를 수정하는 Server Action. */
export async function updateRequestAction(
  projectId: number,
  requestId: number,
  input: UpdateRequestInput,
): Promise<RequestActionResult> {
  try {
    const request = await updateRequest(projectId, requestId, input);
    return { ok: true, request };
  } catch (error: unknown) {
    return { ok: false, message: getRequestActionErrorMessage(error) };
  }
}

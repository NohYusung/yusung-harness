"use client";

import { useState, type FormEvent } from "react";
import {
  createRequestAction,
  updateRequestAction,
} from "@/actions/requests";
import type { Request } from "@/types/dashboard";

/** 생성·수정 성공 결과를 Workbench의 Request 목록에 반영하는 편집기 props. */
interface RequestDocumentEditorProps {
  onCancel: () => void;
  onSaved: (request: Request) => void;
  projectId: number;
  request: Request | null;
}

/** REST Request 문서를 생성하거나 기존 문서의 제목과 본문을 수정한다. */
export function RequestDocumentEditor({
  onCancel,
  onSaved,
  projectId,
  request,
}: RequestDocumentEditorProps) {
  const [title, setTitle] = useState(request?.title ?? "");
  const [content, setContent] = useState(request?.content ?? "");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = request !== null;

  /** 입력을 검증한 뒤 성공한 REST 결과만 상위 Workbench에 전달한다. */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();
    const normalizedContent = content.trim();

    /** 브라우저 기본 validation을 우회한 제출도 기존 record를 건드리지 않고 차단한다. */
    if (!normalizedTitle || !normalizedContent) {
      setErrorMessage("Title and content are required.");
      return;
    }

    setErrorMessage(null);
    setIsSaving(true);

    try {
      /** 수정 API 계약의 status는 사용자 입력 없이 기존 lifecycle 값을 보존한다. */
      const result = isEditing
        ? await updateRequestAction(projectId, request.id, {
            title: normalizedTitle,
            content: normalizedContent,
            status: request.status,
          })
        : await createRequestAction(projectId, {
            title: normalizedTitle,
            content: normalizedContent,
          });

      /** REST 실패면 입력값과 기존 목록을 보존하고 편집기 안에서 오류를 알린다. */
      if (!result.ok) {
        setErrorMessage(result.message);
        return;
      }

      onSaved(result.request);
    } catch (error: unknown) {
      /** Server Action transport 실패도 편집기를 닫지 않고 접근 가능한 오류로 표시한다. */
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "The request could not be saved.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form
      aria-label="Request editor"
      className="flex h-full min-h-0 flex-col gap-5"
      onSubmit={handleSubmit}
    >
      <div>
        <p className="m-0 font-mono text-[10px] tracking-[0.1em] text-primary uppercase">
          Request document
        </p>
        <h3 className="mt-1 mb-0 text-lg font-semibold text-ink">
          {isEditing ? "Edit request" : "New request"}
        </h3>
      </div>

      {errorMessage ? (
        <p
          className="rounded-control border border-danger bg-danger-soft px-3 py-2.5 text-sm text-danger"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}

      <label className="block space-y-2 text-xs font-medium text-muted">
        <span>Title</span>
        <input
          aria-label="Title"
          autoFocus
          className="min-h-11 w-full rounded-control border border-line bg-surface-muted px-3 text-sm text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          disabled={isSaving}
          maxLength={255}
          onChange={(event) => setTitle(event.target.value)}
          required
          value={title}
        />
      </label>

      <label className="flex min-h-0 flex-1 flex-col gap-2 text-xs font-medium text-muted">
        <span>Content</span>
        <textarea
          aria-label="Content"
          className="min-h-80 w-full flex-1 resize-y rounded-control border border-line bg-surface-muted px-3 py-2.5 text-sm leading-6 text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          disabled={isSaving}
          onChange={(event) => setContent(event.target.value)}
          required
          value={content}
        />
      </label>

      <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
        <button
          className="min-h-11 rounded-control border border-line px-4 text-sm font-medium text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          disabled={isSaving}
          onClick={onCancel}
          type="button"
        >
          Cancel
        </button>
        <button
          className="min-h-11 rounded-control bg-primary px-4 text-sm font-semibold text-canvas hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          disabled={isSaving}
          type="submit"
        >
          {isSaving
            ? "Saving…"
            : isEditing
              ? "Save request"
              : "Create request"}
        </button>
      </div>
    </form>
  );
}

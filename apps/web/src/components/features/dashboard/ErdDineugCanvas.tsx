"use client";

import type { ErdEditorElement } from "@dineug/erd-editor";
import { useEffect, useRef, useState } from "react";
import type { DineugErdDocument } from "@/lib/erd-dineug";

interface ErdDineugCanvasProps {
  document: DineugErdDocument;
  recordId: number;
  title: string;
}

/** 브라우저에서만 Dineug custom element를 등록하고 읽기 전용 문서를 주입한다. */
export function ErdDineugCanvas({
  document,
  recordId,
  title,
}: ErdDineugCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">(
    "loading",
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const mountedHost = host;

    let active = true;
    let editor: ErdEditorElement | null = null;

    async function mountEditor() {
      try {
        await import("@dineug/erd-editor");
        if (!active) return;

        editor = window.document.createElement("erd-editor");
        editor.readonly = true;
        editor.systemDarkMode = true;
        editor.enableThemeBuilder = false;
        editor.className = "block h-full min-h-72 w-full";
        editor.setAttribute("aria-label", `${title} Dineug ERD canvas`);
        editor.setInitialValue(JSON.stringify(document));
        mountedHost.replaceChildren(editor);
        setState("ready");
      } catch {
        editor?.destroy();
        editor = null;
        if (active) setState("error");
      }
    }

    void mountEditor();

    return () => {
      active = false;
      editor?.destroy();
      mountedHost.replaceChildren();
    };
  }, [document, recordId, title]);

  return (
    <div
      aria-busy={state === "loading"}
      aria-label={`${title} ERD preview`}
      className="relative h-full min-h-72 w-full overflow-hidden rounded-card border border-line bg-surface shadow-card"
      data-erd-dineug-preview
      role="region"
    >
      <div ref={hostRef} className="h-full min-h-72 w-full" />
      {state === "loading" ? (
        <div
          aria-label="Loading Dineug ERD"
          className="absolute inset-0 grid place-items-center bg-surface text-sm text-muted"
          role="status"
        >
          Loading Dineug ERD…
        </div>
      ) : null}
      {state === "error" ? (
        <div
          aria-label={`${title} ERD renderer error`}
          className="absolute inset-0 grid place-items-center bg-danger-soft p-8 text-center"
          role="alert"
        >
          <div className="max-w-md">
            <p className="m-0 text-sm font-semibold text-danger">
              Dineug renderer unavailable
            </p>
            <p className="mt-2 text-sm leading-6 text-muted">
              The validated ERD document could not be loaded by the browser
              renderer.
            </p>
            <p className="mt-2 font-mono text-xs text-subtle">
              ERD #{recordId}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

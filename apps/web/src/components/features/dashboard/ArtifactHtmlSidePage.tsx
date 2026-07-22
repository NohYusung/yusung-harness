"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { HtmlArtifactDocument } from "@/types/dashboard";

export type HtmlArtifactKind = "Asset" | "Wireframe" | "Design";

export interface HtmlArtifactSelection {
  kind: HtmlArtifactKind;
  record: HtmlArtifactDocument;
}

interface ArtifactHtmlSidePageProps {
  onClose: () => void;
  selection: HtmlArtifactSelection | null;
}

interface WidthBounds {
  max: number;
  min: number;
}

const defaultPanelWidth = 760;
const minimumDesktopPanelWidth = 560;
const preservedWorkspaceWidth = 280;
const resizeStep = 32;
const largeResizeStep = 80;
const defaultWidthRatio = 0.64;
const previewEscapeMessage = "YUSUNG_HARNESS_HTML_PREVIEW_ESCAPE";

const previewContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "object-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
].join("; ");

function buildSandboxedPreviewHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${previewContentSecurityPolicy}">`;
  const escapeBridge = `<script>window.addEventListener("keydown",function(event){if(event.key==="Escape"){window.parent.postMessage({type:"${previewEscapeMessage}"},"*")}})</script>`;
  const protectedHead = `${policy}${escapeBridge}`;
  const content = html.replace(/^\s*<!doctype[^>]*>\s*/i, "");

  /** 원본의 fake tag를 탐색하지 않고 보호된 실제 head 뒤에 콘텐츠를 병합한다. */
  return `<!doctype html><html><head>${protectedHead}</head>${content}</html>`;
}

function getWidthBounds(viewportWidth: number): WidthBounds {
  const min = Math.min(minimumDesktopPanelWidth, viewportWidth);
  const max = Math.max(min, viewportWidth - preservedWorkspaceWidth);

  return { max, min };
}

function clampWidth(width: number, bounds: WidthBounds): number {
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(width)));
}

export function ArtifactHtmlSidePage({
  onClose,
  selection,
}: ArtifactHtmlSidePageProps) {
  const previewId = useId();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previewFrameRef = useRef<HTMLIFrameElement>(null);
  const dragStateRef = useRef<{
    pointerId: number;
    startWidth: number;
    startX: number;
  } | null>(null);
  const initializedWidthRef = useRef(false);
  const [bounds, setBounds] = useState<WidthBounds>({
    max: defaultPanelWidth,
    min: minimumDesktopPanelWidth,
  });
  const [panelWidth, setPanelWidth] = useState(defaultPanelWidth);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    function updateBounds() {
      const nextBounds = getWidthBounds(window.innerWidth);

      setBounds(nextBounds);
      setPanelWidth((current) => {
        if (!initializedWidthRef.current) {
          initializedWidthRef.current = true;
          return clampWidth(window.innerWidth * defaultWidthRatio, nextBounds);
        }

        return clampWidth(current, nextBounds);
      });
    }

    updateBounds();
    window.addEventListener("resize", updateBounds);

    return () => window.removeEventListener("resize", updateBounds);
  }, []);

  useEffect(() => {
    if (!selection) {
      return;
    }

    function closeOnEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    function closeFromPreview(event: MessageEvent<unknown>) {
      if (event.source !== previewFrameRef.current?.contentWindow) {
        return;
      }

      if (
        typeof event.data === "object" &&
        event.data !== null &&
        "type" in event.data &&
        event.data.type === previewEscapeMessage
      ) {
        onClose();
      }
    }

    document.addEventListener("keydown", closeOnEscape);
    window.addEventListener("message", closeFromPreview);
    closeButtonRef.current?.focus({ preventScroll: true });

    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("message", closeFromPreview);
    };
  }, [onClose, selection]);

  if (!selection) {
    return null;
  }

  function resizeTo(width: number) {
    setPanelWidth(clampWidth(width, bounds));
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      startWidth: panelWidth,
      startX: event.clientX,
    };
    setIsResizing(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const dragState = dragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    resizeTo(dragState.startWidth + dragState.startX - event.clientX);
  }

  function finishPointerResize(event: PointerEvent<HTMLDivElement>) {
    if (dragStateRef.current?.pointerId !== event.pointerId) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragStateRef.current = null;
    setIsResizing(false);
  }

  function handleResizeKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeTo(panelWidth + (event.shiftKey ? largeResizeStep : resizeStep));
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeTo(panelWidth - (event.shiftKey ? largeResizeStep : resizeStep));
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      resizeTo(bounds.min);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      resizeTo(bounds.max);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      resizeTo(window.innerWidth * defaultWidthRatio);
    }
  }

  const panelStyle = {
    "--artifact-panel-width": `${panelWidth}px`,
  } as CSSProperties;

  return (
    <aside
      aria-label={`${selection.kind} preview: ${selection.record.title}`}
      className="fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l bg-surface shadow-2xl lg:w-(--artifact-panel-width)"
      style={panelStyle}
    >
      <div
        aria-controls={previewId}
        aria-label="Resize HTML preview"
        aria-orientation="vertical"
        aria-valuemax={bounds.max}
        aria-valuemin={bounds.min}
        aria-valuenow={panelWidth}
        aria-valuetext={`${panelWidth} pixels`}
        className="group absolute inset-y-0 left-0 z-30 hidden w-3 -translate-x-1/2 touch-none cursor-col-resize items-center justify-center focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none lg:flex"
        onDoubleClick={() => resizeTo(window.innerWidth * defaultWidthRatio)}
        onKeyDown={handleResizeKeyDown}
        onLostPointerCapture={finishPointerResize}
        onPointerCancel={finishPointerResize}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointerResize}
        role="separator"
        tabIndex={0}
      >
        <span
          className={
            isResizing
              ? "h-16 w-1 rounded-full bg-primary"
              : "h-16 w-1 rounded-full bg-line transition-colors group-hover:bg-primary group-focus-visible:bg-primary motion-reduce:transition-none"
          }
        />
      </div>

      <header className="flex min-h-20 items-center gap-4 border-b px-5 py-4 sm:px-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary-soft px-2 py-1 font-mono text-micro font-semibold uppercase tracking-[0.12em] text-primary">
              {selection.kind}
            </span>
            <span className="hidden text-xs text-subtle sm:inline">
              Drag the left edge to resize
            </span>
          </div>
          <h2 className="mt-2 truncate text-base font-semibold text-ink sm:text-lg">
            {selection.record.title}
          </h2>
        </div>
        <button
          ref={closeButtonRef}
          aria-label="Close preview"
          className="grid min-h-11 min-w-11 place-items-center rounded-control text-xl text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none"
          onClick={onClose}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
      </header>

      <div className="relative min-h-0 flex-1 bg-canvas p-0 lg:p-3">
        {isResizing ? (
          <div
            aria-hidden="true"
            className="absolute inset-0 z-20 cursor-col-resize select-none"
          />
        ) : null}
        <iframe
          ref={previewFrameRef}
          id={previewId}
          className="h-full w-full rounded-control border bg-white"
          referrerPolicy="no-referrer"
          sandbox="allow-scripts"
          srcDoc={buildSandboxedPreviewHtml(selection.record.html)}
          title={`${selection.record.title} HTML preview`}
        />
      </div>
    </aside>
  );
}

"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject,
} from "react";
import type { HtmlArtifactDocument } from "@/types/dashboard";

export type HtmlArtifactKind =
  | "Asset"
  | "Wireframe"
  | "Design"
  | "Architecture Plan"
  | "ERD";

export interface HtmlArtifactSelection {
  kind: HtmlArtifactKind;
  record: HtmlArtifactDocument;
}

/** sandbox preview가 부모 UI에 요청하는 Wireframe record 전환 식별자. */
export interface HtmlPreviewWireframeNavigation {
  wireframeId?: string;
  wireframeIndex?: string;
}

interface ArtifactHtmlSidePageProps {
  onClose: () => void;
  selection: HtmlArtifactSelection | null;
}

/** 공용 sandbox iframe에 전달할 HTML artifact와 선택적 DOM 연결 정보. */
interface ArtifactHtmlPreviewFrameProps {
  frameRef?: RefObject<HTMLIFrameElement | null>;
  id?: string;
  onNavigateWireframe?: (target: HtmlPreviewWireframeNavigation) => void;
  onScrollStateChange?: (scrollTop: number) => void;
  record: HtmlArtifactDocument;
}

interface WidthBounds {
  max: number;
  min: number;
}

/** 원본 HTML에서 찾은 실제 시작 태그의 문자열 범위. */
interface HtmlTagRange {
  end: number;
  start: number;
}

const defaultPanelWidth = 760;
const minimumDesktopPanelWidth = 560;
const preservedWorkspaceWidth = 280;
const resizeStep = 32;
const largeResizeStep = 80;
const defaultWidthRatio = 0.64;
const previewEscapeMessage = "YUSUNG_HARNESS_HTML_PREVIEW_ESCAPE";
const previewNavigationMessage = "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE";
const previewScrollMessage = "YUSUNG_HARNESS_HTML_PREVIEW_SCROLL";

// NOTE: 외부 이미지는 HTTPS와 기존 data/blob source만 허용한다.
const previewContentSecurityPolicy = [
  "default-src 'none'",
  "base-uri 'none'",
  "connect-src 'none'",
  "form-action 'none'",
  "frame-src 'none'",
  "img-src data: blob: https:",
  "font-src data:",
  "media-src data: blob:",
  "object-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
].join("; ");

/** 주석 안의 fake document tag를 검색 대상에서 제외하면서 원본 index를 보존한다. */
function maskHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) =>
    " ".repeat(comment.length),
  );
}

/** 주석이 아닌 영역에서 지정한 실제 HTML 시작 태그를 찾는다. */
function findOpeningTag(
  html: string,
  tagName: "body" | "head" | "html",
): HtmlTagRange | null {
  const searchableHtml = maskHtmlComments(html);
  const match = new RegExp(`<${tagName}\\b[^>]*>`, "i").exec(searchableHtml);

  if (!match) {
    return null;
  }

  return {
    end: match.index + match[0].length,
    start: match.index,
  };
}

/** 완성형 문서는 기존 head를 사용하고 fragment는 독립 실행 가능한 문서로 감싼다. */
function mergeProtectedHead(html: string, protectedHead: string): string {
  const content = html.replace(/^\s*<!doctype[^>]*>\s*/i, "");
  const htmlTag = findOpeningTag(content, "html");

  if (!htmlTag) {
    return `<!doctype html><html><head>${protectedHead}</head><body>${content}</body></html>`;
  }

  const headTag = findOpeningTag(content, "head");
  const bodyTag = findOpeningTag(content, "body");

  if (
    headTag &&
    headTag.start > htmlTag.start &&
    (!bodyTag || headTag.start < bodyTag.start)
  ) {
    return `<!doctype html>${content.slice(0, headTag.end)}${protectedHead}${content.slice(headTag.end)}`;
  }

  return `<!doctype html>${content.slice(0, htmlTag.end)}<head>${protectedHead}</head>${content.slice(htmlTag.end)}`;
}

/** hash route는 iframe 안에서 처리하고 상대 HTML 링크는 부모의 record 전환 요청으로 바꾼다. */
function buildNavigationBridge(): string {
  return `<script>(function(){["replaceState","pushState"].forEach(function(methodName){var nativeMethod=history[methodName];history[methodName]=function(data,unused,url){if(typeof url!=="string"||!url.startsWith("#/")){return nativeMethod.apply(history,arguments)}var args=Array.prototype.slice.call(arguments);args[2]="about:srcdoc"+url;try{return nativeMethod.apply(history,args)}catch(error){if(!error||error.name!=="SecurityError"){throw error}window.location.hash=url.slice(1)}}});window.addEventListener("click",function(event){var target=event.target instanceof Element?event.target.closest("a[href]"):null;if(!target){return}var href=target.getAttribute("href");if(!href){return}if(target.matches('a.route-link[href^="#/"]')){event.preventDefault();window.location.hash=href.slice(1);return}if(href.startsWith("#")&&!href.startsWith("#/")){event.preventDefault();window.location.hash=href.slice(1);return}var path=href.split("#",1)[0].split("?",1)[0];var hasAbsolutePrefix=href.startsWith("/")||href.startsWith("#")||/^[a-z][a-z0-9+.-]*:/i.test(href);var isRelativeHtml=!hasAbsolutePrefix&&path.toLowerCase().endsWith(".html");if(!isRelativeHtml){return}event.preventDefault();var wireframeId=target.getAttribute("data-wireframe-id");var wireframeIndex=target.getAttribute("data-wireframe-index");if(!wireframeId&&!wireframeIndex){return}window.parent.postMessage({type:"${previewNavigationMessage}",wireframeId:wireframeId||undefined,wireframeIndex:wireframeIndex||undefined},"*")},true)})()</script>`;
}

/** iframe document의 초기 위치와 이후 scrollTop을 부모 UI에 전달한다. */
function buildScrollBridge(): string {
  return `<script>(function(){function reportScroll(){var scrollingElement=document.scrollingElement||document.documentElement||document.body;var scrollTop=scrollingElement?scrollingElement.scrollTop:0;if(Number.isFinite(scrollTop)&&scrollTop>=0){window.parent.postMessage({type:"${previewScrollMessage}",scrollTop:scrollTop},"*")}}window.addEventListener("load",reportScroll);window.addEventListener("scroll",reportScroll,{passive:true})})()</script>`;
}

/** CSP와 iframe 전용 상호작용 bridge를 원본 문서의 실제 head에 주입한다. */
function buildSandboxedPreviewHtml(html: string): string {
  const policy = `<meta http-equiv="Content-Security-Policy" content="${previewContentSecurityPolicy}">`;
  const escapeBridge = `<script>window.addEventListener("keydown",function(event){if(event.key==="Escape"){window.parent.postMessage({type:"${previewEscapeMessage}"},"*")}})</script>`;
  const navigationBridge = buildNavigationBridge();
  const scrollBridge = buildScrollBridge();
  const protectedHead = `${policy}${escapeBridge}${navigationBridge}${scrollBridge}`;

  return mergeProtectedHead(html, protectedHead);
}

/** HTML artifact를 동일한 CSP와 iframe sandbox 경계 안에서 렌더링한다. */
export function ArtifactHtmlPreviewFrame({
  frameRef,
  id,
  onNavigateWireframe,
  onScrollStateChange,
  record,
}: ArtifactHtmlPreviewFrameProps) {
  const internalFrameRef = useRef<HTMLIFrameElement>(null);
  const resolvedFrameRef = frameRef ?? internalFrameRef;

  /** 현재 iframe이 보낸 검증된 navigation 메시지만 typed callback으로 전달한다. */
  useEffect(() => {
    const navigateWireframe = onNavigateWireframe;

    if (!navigateWireframe) {
      return;
    }

    /** 다른 window나 형식이 다른 postMessage를 preview navigation으로 오인하지 않는다. */
    function navigateFromPreview(event: MessageEvent<unknown>) {
      if (event.source !== resolvedFrameRef.current?.contentWindow) {
        return;
      }

      if (
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data) ||
        event.data.type !== previewNavigationMessage
      ) {
        return;
      }

      const wireframeId =
        "wireframeId" in event.data &&
        typeof event.data.wireframeId === "string" &&
        event.data.wireframeId.trim()
          ? event.data.wireframeId.trim()
          : undefined;
      const wireframeIndex =
        "wireframeIndex" in event.data &&
        typeof event.data.wireframeIndex === "string" &&
        event.data.wireframeIndex.trim()
          ? event.data.wireframeIndex.trim()
          : undefined;

      /** 식별자가 하나도 없는 요청은 native 이동이 차단된 현재 preview에 고정한다. */
      if (!wireframeId && !wireframeIndex) {
        return;
      }

      navigateWireframe?.({ wireframeId, wireframeIndex });
    }

    window.addEventListener("message", navigateFromPreview);
    return () => window.removeEventListener("message", navigateFromPreview);
  }, [onNavigateWireframe, resolvedFrameRef]);

  /** 현재 iframe이 보낸 finite nonnegative scrollTop만 typed callback으로 전달한다. */
  useEffect(() => {
    const changeScrollState = onScrollStateChange;

    if (!changeScrollState) {
      return;
    }

    /** 다른 window, message type, 잘못된 수치의 scroll 상태를 모두 무시한다. */
    function updateScrollStateFromPreview(event: MessageEvent<unknown>) {
      if (event.source !== resolvedFrameRef.current?.contentWindow) {
        return;
      }

      if (
        typeof event.data !== "object" ||
        event.data === null ||
        !("type" in event.data) ||
        event.data.type !== previewScrollMessage ||
        !("scrollTop" in event.data) ||
        typeof event.data.scrollTop !== "number" ||
        !Number.isFinite(event.data.scrollTop) ||
        event.data.scrollTop < 0
      ) {
        return;
      }

      changeScrollState?.(event.data.scrollTop);
    }

    window.addEventListener("message", updateScrollStateFromPreview);
    return () =>
      window.removeEventListener("message", updateScrollStateFromPreview);
  }, [onScrollStateChange, resolvedFrameRef]);

  return (
    <iframe
      ref={resolvedFrameRef}
      id={id}
      className="h-full w-full rounded-control border bg-white"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts"
      srcDoc={buildSandboxedPreviewHtml(record.html)}
      title={`${record.title} HTML preview`}
    />
  );
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
        <ArtifactHtmlPreviewFrame
          frameRef={previewFrameRef}
          id={previewId}
          record={selection.record}
        />
      </div>
    </aside>
  );
}

"use client";

import ReactMarkdown, { type Components } from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import type { MouseEvent as ReactMouseEvent } from "react";

/** sanitize가 사용자 제공 heading id에 붙이는 DOM clobbering 방지 접두사. */
const safeHeadingIdPrefix = "user-content-";

/** 저장된 Markdown 본문을 표시하기 위한 컴포넌트 입력. */
interface MarkdownContentProps {
  content: string;
}

/** 보기 좋은 `#slug` 링크를 sanitize가 만든 안전한 heading id로 연결한다. */
function handleMarkdownLinkClick(
  event: ReactMouseEvent<HTMLAnchorElement>,
  href: string | undefined,
): void {
  /** 외부 링크와 빈 fragment는 브라우저의 기존 링크 동작을 유지한다. */
  if (!href?.startsWith("#") || href.length === 1) return;

  let headingSlug: string;

  /** 잘못 인코딩된 fragment는 탐색하지 않고 기존 링크 동작에 맡긴다. */
  try {
    headingSlug = decodeURIComponent(href.slice(1)).toLowerCase();
  } catch {
    return;
  }

  const markdownRoot =
    event.currentTarget.closest<HTMLElement>("[data-markdown-content]");

  /** 같은 Markdown 문서 안에서만 접두사가 적용된 안전한 heading을 찾는다. */
  const heading = Array.from(
    markdownRoot?.querySelectorAll<HTMLElement>("[id]") ?? [],
  ).find(
    (candidate) => candidate.id === `${safeHeadingIdPrefix}${headingSlug}`,
  );

  /** 대응 heading이 없으면 fragment의 기본 동작을 보존한다. */
  if (!heading) return;

  event.preventDefault();
  heading.scrollIntoView();
  heading.focus({ preventScroll: true });
}

/** Markdown 의미 요소를 dashboard의 dark theme typography로 변환한다. */
const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a
      className="break-words font-medium text-primary underline decoration-primary underline-offset-4 hover:decoration-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      href={href}
      onClick={(event) => handleMarkdownLinkClick(event, href)}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-5 border-l-2 border-primary bg-surface-muted px-4 py-3 text-ink">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded-control border border-line-strong bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </code>
  ),
  h1: ({ children, id }) => (
    <h1
      className="mt-0 mb-6 text-2xl leading-tight font-bold tracking-[-0.025em] text-ink"
      id={id}
      tabIndex={-1}
    >
      {children}
    </h1>
  ),
  h2: ({ children, id }) => (
    <h2
      className="mt-8 mb-4 border-b border-line pb-2 text-xl leading-snug font-semibold text-ink"
      id={id}
      tabIndex={-1}
    >
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3
      className="mt-6 mb-3 text-base leading-snug font-semibold text-ink"
      id={id}
      tabIndex={-1}
    >
      {children}
    </h3>
  ),
  h4: ({ children, id }) => (
    <h4
      className="mt-5 mb-2 text-sm leading-snug font-semibold text-ink"
      id={id}
      tabIndex={-1}
    >
      {children}
    </h4>
  ),
  hr: () => <hr className="my-6 border-0 border-t border-line" />,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  ol: ({ children }) => (
    <ol className="my-3 list-decimal space-y-1.5 pl-5 marker:text-subtle">
      {children}
    </ol>
  ),
  p: ({ children }) => (
    <p className="my-3 break-words text-ink first:mt-0 last:mb-0">
      {children}
    </p>
  ),
  pre: ({ children }) => (
    <pre className="my-5 overflow-x-auto rounded-card border border-line-strong bg-canvas p-4 font-mono text-sm leading-7 text-ink [&_code]:border-0 [&_code]:bg-transparent [&_code]:p-0 [&_code]:text-inherit">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  table: ({ children }) => (
    <div className="my-5 overflow-x-auto rounded-card border border-line-strong">
      <table className="w-full border-collapse text-left text-sm leading-6 text-ink">
        {children}
      </table>
    </div>
  ),
  td: ({ children }) => (
    <td className="border-t border-line px-3 py-2.5 align-top text-ink">
      {children}
    </td>
  ),
  th: ({ children }) => (
    <th className="border-b border-line-strong bg-surface-muted px-3 py-2.5 font-semibold text-ink">
      {children}
    </th>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-subtle">
      {children}
    </ul>
  ),
};

/** Research 등 text artifact의 Markdown/GFM을 raw HTML 실행 없이 렌더링한다. */
export function MarkdownContent({ content }: MarkdownContentProps) {
  const markdown = content.trim();

  /** 빈 본문은 Markdown tree 대신 명시적인 empty state를 표시한다. */
  if (!markdown) {
    return <p className="m-0 text-muted">No content has been saved yet.</p>;
  }

  return (
    <div
      className="min-w-0 text-sm leading-7 text-ink"
      data-markdown-content
    >
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeSlug, rehypeSanitize]}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

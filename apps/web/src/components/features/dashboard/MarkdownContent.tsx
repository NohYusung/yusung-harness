import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/** 저장된 Markdown 본문을 표시하기 위한 컴포넌트 입력. */
interface MarkdownContentProps {
  content: string;
}

/** Markdown 의미 요소를 dashboard의 dark theme typography로 변환한다. */
const markdownComponents: Components = {
  a: ({ children, href }) => (
    <a
      className="break-words text-primary underline decoration-primary/50 underline-offset-2 hover:decoration-primary focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      href={href}
    >
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-4 border-l-2 border-line-strong pl-4 text-muted italic">
      {children}
    </blockquote>
  ),
  code: ({ children }) => (
    <code className="rounded-control bg-surface-muted px-1.5 py-0.5 font-mono text-[0.9em] text-ink">
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h1 className="mt-0 mb-5 text-xl leading-tight font-semibold tracking-[-0.025em] text-ink">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-7 mb-3 border-b border-line pb-2 text-base leading-snug font-semibold text-ink">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-6 mb-2 text-sm leading-snug font-semibold text-ink">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-5 mb-2 text-[13px] leading-snug font-semibold text-ink">
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
    <p className="my-3 break-words first:mt-0 last:mb-0">{children}</p>
  ),
  pre: ({ children }) => (
    <pre className="my-4 overflow-x-auto rounded-card border border-line bg-canvas p-4 font-mono text-xs leading-6 text-ink [&_code]:bg-transparent [&_code]:p-0">
      {children}
    </pre>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-ink">{children}</strong>
  ),
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-card border border-line">
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  td: ({ children }) => (
    <td className="border-t border-line px-3 py-2 align-top">{children}</td>
  ),
  th: ({ children }) => (
    <th className="bg-surface-muted px-3 py-2 font-semibold text-ink">
      {children}
    </th>
  ),
  ul: ({ children }) => (
    <ul className="my-3 list-disc space-y-1.5 pl-5 marker:text-subtle">
      {children}
    </ul>
  ),
};

/** Draft 등 text artifact의 Markdown/GFM을 raw HTML 실행 없이 렌더링한다. */
export function MarkdownContent({ content }: MarkdownContentProps) {
  const markdown = content.trim();

  /** 빈 본문은 Markdown tree 대신 명시적인 empty state를 표시한다. */
  if (!markdown) {
    return <p className="m-0 text-muted">No content has been saved yet.</p>;
  }

  return (
    <div className="min-w-0 text-[13px] leading-[1.7] text-[#c4cfdd]">
      <ReactMarkdown
        components={markdownComponents}
        remarkPlugins={[remarkGfm]}
        skipHtml
      >
        {markdown}
      </ReactMarkdown>
    </div>
  );
}

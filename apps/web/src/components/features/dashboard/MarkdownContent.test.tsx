import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

const readableMarkdown = `# Readable heading

Readable body with a [visible link](https://example.com) and \`inline code\`.

> Readable quote

\`\`\`ts
const visible = true;
\`\`\`

| Column | Value |
| --- | --- |
| Contrast | High |
`;

describe("MarkdownContent readability", () => {
  it("heading과 본문, 링크에 큰 글자와 고대비 typography를 적용한다", () => {
    const { container } = render(<MarkdownContent content={readableMarkdown} />);

    expect(container.firstElementChild).toHaveClass(
      "text-sm",
      "leading-7",
      "text-ink",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Readable heading" }),
    ).toHaveClass("text-2xl", "font-bold", "text-ink");
    expect(screen.getByText(/Readable body with a/)).toHaveClass("text-ink");
    expect(screen.getByRole("link", { name: "visible link" })).toHaveClass(
      "font-medium",
      "text-primary",
      "decoration-primary",
      "underline-offset-4",
    );
  });

  it("blockquote와 code, table을 선명한 surface와 읽기 쉬운 글자 크기로 구분한다", () => {
    const { container } = render(<MarkdownContent content={readableMarkdown} />);

    expect(container.querySelector("blockquote")).toHaveClass(
      "border-primary",
      "bg-surface-muted",
      "px-4",
      "py-3",
      "text-ink",
    );

    const inlineCode = container.querySelector("p code");
    expect(inlineCode).toHaveClass(
      "border",
      "border-line-strong",
      "bg-surface-muted",
      "text-ink",
    );

    const codeBlock = container.querySelector("pre");
    expect(codeBlock).toHaveClass(
      "border-line-strong",
      "bg-canvas",
      "text-sm",
      "leading-7",
      "text-ink",
    );

    const table = screen.getByRole("table");
    expect(table.parentElement).toHaveClass("border-line-strong");
    expect(table).toHaveClass("text-sm", "leading-6", "text-ink");
    expect(screen.getByRole("columnheader", { name: "Column" })).toHaveClass(
      "bg-surface-muted",
      "text-ink",
    );
    expect(screen.getByRole("cell", { name: "Contrast" })).toHaveClass(
      "border-line",
      "text-ink",
    );
  });
});

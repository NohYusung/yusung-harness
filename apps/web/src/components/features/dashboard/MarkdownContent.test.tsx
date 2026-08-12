import { fireEvent, render, screen } from "@testing-library/react";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MarkdownContent } from "./MarkdownContent";

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const scrollIntoView = vi.fn();

/** jsdom에 없는 scrollIntoView를 내부 목차 이동 검증용 spy로 제공한다. */
beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });
});

/** 테스트가 덮어쓴 DOM prototype을 원래 환경으로 복원한다. */
afterAll(() => {
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: originalScrollIntoView,
    });
    return;
  }

  Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
});

/** 각 테스트는 독립적인 scroll 호출 이력에서 시작한다. */
beforeEach(() => {
  scrollIntoView.mockClear();
});

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

describe("MarkdownContent heading navigation", () => {
  it("한글과 숫자, 가운뎃점이 포함된 h1~h4에 안전한 GitHub slug를 적용한다", () => {
    render(
      <MarkdownContent
        content={`# ArchitecturePlan

## 7. 런타임·인프라 구성

### 7.4 코드·런타임 매핑

#### 15.4 변경 이력`}
      />,
    );

    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute(
      "id",
      "user-content-architectureplan",
    );
    expect(screen.getByRole("heading", { level: 2 })).toHaveAttribute(
      "id",
      "user-content-7-런타임인프라-구성",
    );
    expect(screen.getByRole("heading", { level: 3 })).toHaveAttribute(
      "id",
      "user-content-74-코드런타임-매핑",
    );
    expect(screen.getByRole("heading", { level: 4 })).toHaveAttribute(
      "id",
      "user-content-154-변경-이력",
    );

    /** 목차 이동 후 script로 초점을 줄 수 있도록 모든 지원 heading을 준비한다. */
    for (const heading of screen.getAllByRole("heading")) {
      expect(heading).toHaveAttribute("tabindex", "-1");
    }
  });

  it("중복 heading에 충돌하지 않는 순번 slug를 생성한다", () => {
    render(<MarkdownContent content={`## 같은 제목\n\n## 같은 제목`} />);

    const headings = screen.getAllByRole("heading", { name: "같은 제목" });
    expect(headings[0]).toHaveAttribute("id", "user-content-같은-제목");
    expect(headings[1]).toHaveAttribute("id", "user-content-같은-제목-1");
  });

  it("보기 좋은 내부 링크를 안전한 heading으로 스크롤하고 초점을 이동한다", () => {
    render(
      <MarkdownContent
        content={`[구성으로 이동](#7-런타임인프라-구성)

## 7. 런타임·인프라 구성`}
      />,
    );

    const link = screen.getByRole("link", { name: "구성으로 이동" });
    const heading = screen.getByRole("heading", {
      name: "7. 런타임·인프라 구성",
    });

    expect(decodeURIComponent(link.getAttribute("href") ?? "")).toBe(
      "#7-런타임인프라-구성",
    );
    expect(fireEvent.click(link)).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledOnce();
    expect(scrollIntoView.mock.contexts[0]).toBe(heading);
    expect(heading).toHaveFocus();
  });

  it("외부 링크는 기존 href 동작을 유지하고 heading 이동을 실행하지 않는다", () => {
    render(
      <MarkdownContent content="[외부 문서](https://example.com/reference)" />,
    );

    const link = screen.getByRole("link", { name: "외부 문서" });
    let markdownPreventedNavigation = true;

    /** React handler 실행 뒤 기본 탐색 여부를 기록하고 jsdom의 미지원 navigation만 차단한다. */
    document.addEventListener(
      "click",
      (event) => {
        markdownPreventedNavigation = event.defaultPrevented;
        event.preventDefault();
      },
      { once: true },
    );

    expect(link).toHaveAttribute("href", "https://example.com/reference");
    fireEvent.click(link);
    expect(markdownPreventedNavigation).toBe(false);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("raw HTML은 계속 차단한다", () => {
    const { container } = render(
      <MarkdownContent
        content={`본문

<script>window.compromised = true</script>
<h2 id="unsafe-heading">Unsafe heading</h2>`}
      />,
    );

    expect(container.querySelector("script")).not.toBeInTheDocument();
    expect(container.querySelector("#unsafe-heading")).not.toBeInTheDocument();
    expect(screen.queryByText("Unsafe heading")).not.toBeInTheDocument();
  });
});

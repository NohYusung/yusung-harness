import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createAsset } from "@/test/fixtures/dashboard";
import {
  ArtifactHtmlPreviewFrame,
  ArtifactHtmlSidePage,
  previewViewportPresets,
} from "./ArtifactHtmlSidePage";

describe("ArtifactHtmlSidePage", () => {
  it("viewport를 생략하면 기존 full-size iframe과 title 계약을 유지한다", () => {
    const design = createAsset({ title: "Default viewport preview" });

    const { container } = render(<ArtifactHtmlPreviewFrame record={design} />);

    const preview = screen.getByTitle(
      "Default viewport preview HTML preview",
    );

    expect(preview).toHaveClass("h-full", "w-full");
    expect(preview).not.toHaveStyle({
      height: `${previewViewportPresets.desktop.height}px`,
      width: `${previewViewportPresets.desktop.width}px`,
    });
    expect(container.querySelector("[data-mobile-device-frame]")).toBeNull();
  });

  it("Mobile 390 × 844 iframe을 장식이 접근성 트리에서 숨겨진 휴대폰 frame 안에 렌더한다", () => {
    const design = createAsset({ title: "Mobile device preview" });
    const { container } = render(
      <ArtifactHtmlPreviewFrame record={design} viewport="mobile" />,
    );
    const mobilePreset = previewViewportPresets.mobile;
    const preview = screen.getByTitle(
      `Mobile device preview HTML preview · ${mobilePreset.label} ${mobilePreset.width} × ${mobilePreset.height}`,
    );
    const deviceFrame = preview.closest("[data-mobile-device-frame]");

    expect(deviceFrame).not.toBeNull();
    expect(deviceFrame).toContainElement(preview);
    expect(deviceFrame).toHaveClass(
      "box-content",
      "border-2",
      "px-[12px]",
      "pt-[28px]",
      "pb-[24px]",
      "pointer-events-none",
    );
    expect(preview).toHaveStyle({
      height: `${mobilePreset.height}px`,
      width: `${mobilePreset.width}px`,
    });
    expect(preview).toHaveClass(
      "block",
      "border-0",
      "pointer-events-auto",
    );

    const decorativeHardware = container.querySelectorAll(
      "[data-mobile-device-hardware]",
    );
    expect(decorativeHardware.length).toBeGreaterThan(0);
    decorativeHardware.forEach((element) => {
      expect(element).toHaveAttribute("aria-hidden", "true");
      expect(element).toHaveClass("pointer-events-none");
    });
  });

  it("mobile↔desktop 전환은 phone frame만 바꾸고 같은 iframe과 srcDoc을 유지한다", () => {
    const design = createAsset({ title: "Responsive design preview" });
    const { container, rerender } = render(
      <ArtifactHtmlPreviewFrame record={design} viewport="desktop" />,
    );
    const desktopPreset = previewViewportPresets.desktop;
    const desktopTitle = `Responsive design preview HTML preview · ${desktopPreset.label} ${desktopPreset.width} × ${desktopPreset.height}`;
    const preview = screen.getByTitle(desktopTitle);
    const originalSrcDoc = preview.getAttribute("srcdoc");

    expect(preview).toHaveStyle({
      height: `${desktopPreset.height}px`,
      width: `${desktopPreset.width}px`,
    });
    expect(preview).toHaveClass("box-content");
    expect(container.querySelector("[data-mobile-device-frame]")).toBeNull();

    rerender(<ArtifactHtmlPreviewFrame record={design} viewport="mobile" />);

    const mobilePreset = previewViewportPresets.mobile;
    const mobilePreview = screen.getByTitle(
      `Responsive design preview HTML preview · ${mobilePreset.label} ${mobilePreset.width} × ${mobilePreset.height}`,
    );

    expect(mobilePreview).toBe(preview);
    expect(mobilePreview).toHaveAttribute("srcdoc", originalSrcDoc);
    expect(mobilePreview).toHaveStyle({
      height: `${mobilePreset.height}px`,
      width: `${mobilePreset.width}px`,
    });
    expect(mobilePreview.closest("[data-mobile-device-frame]")).not.toBeNull();

    rerender(<ArtifactHtmlPreviewFrame record={design} viewport="desktop" />);

    const restoredDesktopPreview = screen.getByTitle(desktopTitle);
    expect(restoredDesktopPreview).toBe(preview);
    expect(restoredDesktopPreview).toHaveAttribute("srcdoc", originalSrcDoc);
    expect(container.querySelector("[data-mobile-device-frame]")).toBeNull();
  });

  it.each([
    {
      html: '<!doctype html><html lang="ko"><head><title>Original complete title</title></head><body><main data-original-content="complete"><span>Complete source marker</span></main></body></html>',
      marker: "Complete source marker",
      shape: "complete",
      title: "Complete themed preview",
    },
    {
      html: '<!doctype html><html lang="ko"><body><main data-original-content="headless"><span>Headless source marker</span></main></body></html>',
      marker: "Headless source marker",
      shape: "headless",
      title: "Headless themed preview",
    },
    {
      html: '<main data-original-content="fragment"><span>Fragment source marker</span></main>',
      marker: "Fragment source marker",
      shape: "fragment",
      title: "Fragment themed preview",
    },
  ])(
    "$shape HTML에 preview theme을 한 번만 주입하고 보호 경계와 원본을 보존한다",
    ({ html, marker, shape, title }) => {
      const design = createAsset({ html, title });

      render(<ArtifactHtmlPreviewFrame record={design} />);

      const srcdoc =
        screen
          .getByTitle(`${title} HTML preview`)
          .getAttribute("srcdoc") ?? "";
      const srcdocDocument = new DOMParser().parseFromString(
        srcdoc,
        "text/html",
      );
      const previewThemeStyles = srcdocDocument.querySelectorAll(
        "style[data-yusung-harness-preview-theme]",
      );
      const previewThemeStyle = previewThemeStyles.item(0);

      expect(
        srcdoc.match(/<style data-yusung-harness-preview-theme>/g),
      ).toHaveLength(1);
      expect(previewThemeStyles).toHaveLength(1);
      expect(previewThemeStyle?.parentElement?.tagName).toBe("HEAD");
      expect(previewThemeStyle?.textContent?.trim()).toBeTruthy();

      expect(
        srcdocDocument.querySelectorAll(
          'meta[http-equiv="Content-Security-Policy"]',
        ),
      ).toHaveLength(1);
      expect(srcdoc).toContain("style-src 'unsafe-inline'");
      expect(srcdoc).toContain("YUSUNG_HARNESS_HTML_PREVIEW_ESCAPE");
      expect(srcdoc).toContain("YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE");
      expect(srcdoc).toContain("YUSUNG_HARNESS_HTML_PREVIEW_SCROLL");

      const originalContent = srcdocDocument.querySelector(
        `[data-original-content="${shape}"]`,
      );
      expect(originalContent).not.toBeNull();
      expect(originalContent?.textContent).toContain(marker);
      expect(srcdoc).toContain(
        `<main data-original-content="${shape}"><span>${marker}</span></main>`,
      );
    },
  );

  it("preview theme은 원본 style 다음에 위치하고 레거시 색상 변수를 비파랑 팔레트로 재매핑한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><style data-original-theme>:root{--canvas:#0b0e13;--blue:#79b8ff;--teal:#6ed6ce}</style></head><body><main>Legacy themed preview</main></body></html>',
      title: "Legacy themed preview",
    });

    render(<ArtifactHtmlPreviewFrame record={design} />);

    const srcdoc =
      screen
        .getByTitle("Legacy themed preview HTML preview")
        .getAttribute("srcdoc") ?? "";
    const originalThemeIndex = srcdoc.indexOf("<style data-original-theme>");
    const previewThemeIndex = srcdoc.indexOf(
      "<style data-yusung-harness-preview-theme>",
    );

    expect(originalThemeIndex).toBeGreaterThan(-1);
    expect(previewThemeIndex).toBeGreaterThan(originalThemeIndex);
    expect(srcdoc).toContain("--canvas:#F3F0EC");
    expect(srcdoc).toContain("--sidebar:#292A2C");
    expect(srcdoc).toContain("--primary:#6B1E2E");
    expect(srcdoc).toContain("--selected:#F4E4E5");
    expect(srcdoc).toContain("--blue:#6B1E2E");
    expect(srcdoc).toContain("--navy:#292A2C");
    expect(srcdoc).toContain("--cyan:#5D5654");
    expect(srcdoc).toContain("--teal:#5D5654");
    expect(srcdoc).toContain("--success:#46633F");
    expect(srcdoc).toContain("--warning:#7A5726");
    expect(srcdoc).toContain("--danger:#9B2F34");
    expect(srcdoc).toContain(
      ":root:not(#yusung-harness-preview-theme-scope) :where(body *){border-color:var(--line)!important;background-color:transparent!important;color:var(--ink)!important",
    );
    expect(srcdoc).toContain("--blue:#79b8ff;--teal:#6ed6ce");

    const previewThemeText = new DOMParser()
      .parseFromString(srcdoc, "text/html")
      .querySelector("style[data-yusung-harness-preview-theme]")?.textContent;

    expect(previewThemeText).not.toMatch(
      /(?:^|[;}])(?:display|position|inset|margin|padding|gap|width|height|min-width|max-width|min-height|max-height|border-radius|box-shadow|grid-template|transform|transition)\s*:/,
    );
    expect(previewThemeText).not.toContain("@media");
    expect(previewThemeText).not.toMatch(
      /#(?:173C2E|315845|8A5700|D29A2B|F2E5C3)\b/i,
    );
  });

  it("주석의 fake head보다 앞선 실제 protected head를 한 번만 생성한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><!-- <head></head> --><body class="preview"><script src="https://evil.invalid/x.js"></script><main>Adversarial</main></body></html>',
      title: "Adversarial document",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Asset", record: design }}
      />,
    );

    const srcdoc = screen
      .getByTitle("Adversarial document HTML preview")
      .getAttribute("srcdoc");

    expect(srcdoc).toMatch(
      /^<!doctype html><html><head><meta http-equiv="Content-Security-Policy"/,
    );
    expect(srcdoc?.indexOf("<!-- <head></head> -->")).toBeGreaterThan(
      srcdoc?.indexOf("<head><meta") ?? -1,
    );
    expect(srcdoc?.match(/Content-Security-Policy/g)).toHaveLength(1);
    expect(srcdoc?.match(/YUSUNG_HARNESS_HTML_PREVIEW_ESCAPE/g)).toHaveLength(1);
    expect(srcdoc).toContain(
      'window.parent.postMessage({type:"YUSUNG_HARNESS_HTML_PREVIEW_ESCAPE"},"*")',
    );
    expect(srcdoc).toContain('body class="preview"');
    expect(srcdoc).toContain(
      '<script src="https://evil.invalid/x.js"></script><main>Adversarial</main>',
    );
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain("script-src 'unsafe-inline'");
  });

  it("HTTPS 이미지만 허용하고 외부 실행·연결·frame·object는 계속 차단한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><title>External image policy</title></head><body><img alt="HTTPS icon" src="https://cdn.example.com/icon.svg"><img alt="HTTP icon" src="http://cdn.example.com/icon.svg"></body></html>',
      title: "External image policy document",
    });

    render(<ArtifactHtmlPreviewFrame record={design} />);

    const srcdoc =
      screen
        .getByTitle("External image policy document HTML preview")
        .getAttribute("srcdoc") ?? "";
    const srcdocDocument = new DOMParser().parseFromString(srcdoc, "text/html");
    const policy =
      srcdocDocument
        .querySelector('meta[http-equiv="Content-Security-Policy"]')
        ?.getAttribute("content") ?? "";
    const directives = new Map<string, string[]>();

    for (const directive of policy.split(";")) {
      const [name, ...sources] = directive.trim().split(/\s+/);

      if (name) {
        directives.set(name, sources);
      }
    }

    expect(srcdoc).toContain('src="https://cdn.example.com/icon.svg"');
    expect(directives.get("img-src")).toEqual(
      expect.arrayContaining(["data:", "blob:", "https:"]),
    );
    expect(directives.get("img-src")).not.toContain("http:");
    expect(directives.get("default-src")).toEqual(["'none'"]);
    expect(directives.get("connect-src")).toEqual(["'none'"]);
    expect(directives.get("frame-src")).toEqual(["'none'"]);
    expect(directives.get("object-src")).toEqual(["'none'"]);
    expect(directives.get("script-src")).toEqual(["'unsafe-inline'"]);
  });

  it.each([
    {
      html: "<!doctype html><html><body>Headless complete document</body></html>",
      marker: "Headless complete document",
      title: "Headless document",
    },
    {
      html: "<main>Standalone fragment</main>",
      marker: "Standalone fragment",
      title: "HTML fragment",
    },
  ])("$title에도 CSP와 Escape bridge를 주입한다", ({ html, marker, title }) => {
    const design = createAsset({ html, title });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Asset", record: design }}
      />,
    );

    const srcdoc = screen
      .getByTitle(`${title} HTML preview`)
      .getAttribute("srcdoc");

    expect(srcdoc).toContain(marker);
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain("YUSUNG_HARNESS_HTML_PREVIEW_ESCAPE");
    expect(srcdoc).toContain("window.parent.postMessage");
    for (const directive of [
      "default-src 'none'",
      "base-uri 'none'",
      "connect-src 'none'",
      "form-action 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "script-src 'unsafe-inline'",
    ]) {
      expect(srcdoc).toContain(directive);
    }
  });

  it("scroll-state bridge를 주입하고 현재 iframe의 유효한 scrollTop만 전달한다", () => {
    const onScrollStateChange = vi.fn();
    const design = createAsset({
      html: "<!doctype html><html><head><title>Scroll state</title></head><body><main>Scrollable preview</main></body></html>",
      title: "Scroll state bridge document",
    });

    render(
      <ArtifactHtmlPreviewFrame
        onScrollStateChange={onScrollStateChange}
        record={design}
      />,
    );

    const preview = screen.getByTitle(
      "Scroll state bridge document HTML preview",
    ) as HTMLIFrameElement;
    const srcdoc = preview.getAttribute("srcdoc") ?? "";

    expect(srcdoc).toContain("YUSUNG_HARNESS_HTML_PREVIEW_SCROLL");
    expect(srcdoc).toMatch(/addEventListener\(["']scroll["']/);
    expect(srcdoc).toContain("scrollTop");

    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_SCROLL",
          scrollTop: 160,
        },
        source: preview.contentWindow,
      }),
    );
    fireEvent(
      window,
      new MessageEvent("message", {
        data: {
          type: "YUSUNG_HARNESS_HTML_PREVIEW_SCROLL",
          scrollTop: 240,
        },
        source: window,
      }),
    );
    for (const invalidScrollTop of [-1, "64", Number.NaN]) {
      fireEvent(
        window,
        new MessageEvent("message", {
          data: {
            type: "YUSUNG_HARNESS_HTML_PREVIEW_SCROLL",
            scrollTop: invalidScrollTop,
          },
          source: preview.contentWindow,
        }),
      );
    }

    expect(onScrollStateChange).toHaveBeenCalledTimes(1);
    expect(onScrollStateChange).toHaveBeenCalledWith(160);
  });

  it("hash route link의 기본 navigation을 막고 iframe 내부 hash만 갱신하는 bridge를 주입한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><title>Route preview</title></head><body><a class="route-link" href="#/home">Home</a></body></html>',
      title: "Route bridge document",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Asset", record: design }}
      />,
    );

    const preview = screen.getByTitle("Route bridge document HTML preview");
    const srcdoc = preview.getAttribute("srcdoc");

    expect(preview).toHaveAttribute("sandbox", "allow-scripts");
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(srcdoc).toContain('a.route-link[href^="#/"]');
    expect(srcdoc).toMatch(/addEventListener\(["']click["']/);
    expect(srcdoc).toMatch(/preventDefault\(\)/);
    expect(srcdoc).toMatch(/(?:window\.)?location\.hash\s*=/);
    expect(srcdoc).not.toMatch(
      /(?:window\.)?(?:parent|top)\.location(?:\.href)?\s*=/,
    );

    const srcdocDocument = new DOMParser().parseFromString(
      srcdoc ?? "",
      "text/html",
    );
    const navigationBridge = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes('a.route-link[href^="#/"]'),
    )?.textContent;
    expect(navigationBridge).toBeTruthy();

    const previewFrame = document.createElement("iframe");
    document.body.append(previewFrame);
    const previewWindow = previewFrame.contentWindow as
      | (Window & typeof globalThis)
      | null;

    if (!previewWindow || !navigationBridge) {
      throw new Error("JSDOM iframe preview runtime was not initialized");
    }

    previewWindow.location.hash = "#/about";
    previewWindow.document.body.innerHTML =
      '<a class="route-link" href="#/home">Home</a>';
    previewWindow.eval(navigationBridge);

    const parentUrlBeforeClick = window.location.href;
    const topUrlBeforeClick = previewWindow.top?.location.href;
    const routeLink = previewWindow.document.querySelector("a.route-link");
    const navigationAllowed = routeLink?.dispatchEvent(
      new previewWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(navigationAllowed).toBe(false);
    expect(previewWindow.location.hash).toBe("#/home");
    expect(window.location.href).toBe(parentUrlBeforeClick);
    expect(previewWindow.parent.location.href).toBe(parentUrlBeforeClick);
    expect(previewWindow.top?.location.href).toBe(topUrlBeforeClick);

    previewFrame.remove();
  });

  it("일반 section hash link도 native navigation을 막고 iframe hash만 갱신한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><title>Section preview</title></head><body><a href="#result">Result</a><section id="result">Outcome</section></body></html>',
      title: "Section hash bridge document",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Asset", record: design }}
      />,
    );

    const srcdoc =
      screen
        .getByTitle("Section hash bridge document HTML preview")
        .getAttribute("srcdoc") ?? "";
    const srcdocDocument = new DOMParser().parseFromString(srcdoc, "text/html");
    const navigationBridge = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes('a.route-link[href^="#/"]'),
    )?.textContent;
    expect(navigationBridge).toBeTruthy();

    const previewFrame = document.createElement("iframe");
    document.body.append(previewFrame);
    const previewWindow = previewFrame.contentWindow as
      | (Window & typeof globalThis)
      | null;

    if (!previewWindow || !navigationBridge) {
      throw new Error("JSDOM iframe preview runtime was not initialized");
    }

    previewWindow.location.hash = "#intro";
    previewWindow.document.body.innerHTML =
      '<a href="#result">Result</a><section id="result">Outcome</section>';
    previewWindow.eval(navigationBridge);

    const parentUrlBeforeClick = window.location.href;
    const topUrlBeforeClick = previewWindow.top?.location.href;
    const sectionLink = previewWindow.document.querySelector("a");
    const navigationAllowed = sectionLink?.dispatchEvent(
      new previewWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );

    expect(navigationAllowed).toBe(false);
    expect(previewWindow.location.hash).toBe("#result");
    expect(window.location.href).toBe(parentUrlBeforeClick);
    expect(previewWindow.parent.location.href).toBe(parentUrlBeforeClick);
    expect(previewWindow.top?.location.href).toBe(topUrlBeforeClick);

    previewFrame.remove();
  });

  it("wireframe index가 있는 상대 HTML 링크는 iframe 이동을 막고 부모에 navigation을 요청한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><title>Wireframe navigation</title></head><body><a data-wireframe-index="1.2" href="./projects.html">Projects</a></body></html>',
      title: "Wireframe navigation bridge",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Wireframe", record: design }}
      />,
    );

    const srcdoc =
      screen
        .getByTitle("Wireframe navigation bridge HTML preview")
        .getAttribute("srcdoc") ?? "";
    const srcdocDocument = new DOMParser().parseFromString(srcdoc, "text/html");
    const navigationBridge = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes('a.route-link[href^="#/"]'),
    )?.textContent;
    expect(navigationBridge).toBeTruthy();

    const previewFrame = document.createElement("iframe");
    document.body.append(previewFrame);
    const previewWindow = previewFrame.contentWindow as
      | (Window & typeof globalThis)
      | null;

    if (!previewWindow || !navigationBridge) {
      throw new Error("JSDOM iframe preview runtime was not initialized");
    }

    previewWindow.document.body.innerHTML =
      '<a data-wireframe-index="1.2" href="./projects.html">Projects</a>';
    const parentPostMessage = vi
      .spyOn(previewWindow.parent, "postMessage")
      .mockImplementation(() => undefined);
    previewWindow.eval(navigationBridge);

    const previewUrlBeforeClick = previewWindow.location.href;
    const relativeLink = previewWindow.document.querySelector("a");
    const navigationAllowed = relativeLink?.dispatchEvent(
      new previewWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    const navigationMessages = parentPostMessage.mock.calls.filter(
      ([message]) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
    );
    const previewUrlAfterClick = previewWindow.location.href;

    parentPostMessage.mockRestore();
    previewFrame.remove();

    expect(navigationMessages).toHaveLength(1);
    expect(navigationMessages[0]).toEqual([
      expect.objectContaining({
        type: "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
        wireframeIndex: "1.2",
      }),
      "*",
    ]);
    expect(navigationAllowed).toBe(false);
    expect(previewUrlAfterClick).toBe(previewUrlBeforeClick);
  });

  it("표식 없는 상대 HTML 링크도 iframe native navigation을 막고 현재 preview를 유지한다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><title>Unresolved navigation</title></head><body><a href="./projects.html">Projects</a></body></html>',
      title: "Unresolved relative navigation",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Wireframe", record: design }}
      />,
    );

    const srcdoc =
      screen
        .getByTitle("Unresolved relative navigation HTML preview")
        .getAttribute("srcdoc") ?? "";
    const srcdocDocument = new DOMParser().parseFromString(srcdoc, "text/html");
    const navigationBridge = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes('a.route-link[href^="#/"]'),
    )?.textContent;
    expect(navigationBridge).toBeTruthy();

    const previewFrame = document.createElement("iframe");
    document.body.append(previewFrame);
    const previewWindow = previewFrame.contentWindow as
      | (Window & typeof globalThis)
      | null;

    if (!previewWindow || !navigationBridge) {
      throw new Error("JSDOM iframe preview runtime was not initialized");
    }

    previewWindow.document.body.innerHTML =
      '<a href="./projects.html">Projects</a>';
    const parentPostMessage = vi
      .spyOn(window, "postMessage")
      .mockImplementation(() => undefined);
    previewWindow.eval(navigationBridge);

    const previewUrlBeforeClick = previewWindow.location.href;
    const relativeLink = previewWindow.document.querySelector("a");
    const navigationAllowed = relativeLink?.dispatchEvent(
      new previewWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    const navigationMessages = parentPostMessage.mock.calls.filter(
      ([message]) =>
        typeof message === "object" &&
        message !== null &&
        "type" in message &&
        message.type === "YUSUNG_HARNESS_HTML_PREVIEW_NAVIGATE",
    );
    const previewUrlAfterClick = previewWindow.location.href;

    parentPostMessage.mockRestore();
    previewFrame.remove();

    expect(navigationAllowed).toBe(false);
    expect(previewUrlAfterClick).toBe(previewUrlBeforeClick);
    expect(navigationMessages).toHaveLength(0);
  });

  it("완성형 HTML의 기존 head에 보호 meta와 bridge를 중첩 문서 없이 주입한다", () => {
    const design = createAsset({
      html: '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>Existing head marker</title></head><body><main>Complete document</main></body></html>',
      title: "Complete document",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Asset", record: design }}
      />,
    );

    const srcdoc = screen
      .getByTitle("Complete document HTML preview")
      .getAttribute("srcdoc");

    expect(srcdoc?.match(/<html\b/gi)).toHaveLength(1);
    expect(srcdoc?.match(/<head\b/gi)).toHaveLength(1);
    expect(srcdoc?.match(/<body\b/gi)).toHaveLength(1);
    expect(srcdoc).toContain('<html lang="ko">');

    const protectedMetaIndex = srcdoc?.indexOf(
      '<meta http-equiv="Content-Security-Policy"',
    );
    const originalTitleIndex = srcdoc?.indexOf(
      "<title>Existing head marker</title>",
    );
    const headCloseIndex = srcdoc?.indexOf("</head>");

    expect(protectedMetaIndex).toBeGreaterThan(srcdoc?.indexOf("<head>") ?? -1);
    expect(originalTitleIndex).toBeGreaterThan(protectedMetaIndex ?? -1);
    expect(headCloseIndex).toBeGreaterThan(originalTitleIndex ?? -1);
    expect(srcdoc).toContain('a.route-link[href^="#/"]');
  });

  it("opaque srcdoc에서도 Wireframe #3 bootstrap을 중단하지 않고 hashchange render를 실행한다", async () => {
    const wireframe3Bootstrap = `
      (() => {
        const validRoutes = ['home', 'work', 'case-study', 'about', 'resume', 'contact'];
        const pages = [...document.querySelectorAll('[data-page]')];
        const routeLinks = [...document.querySelectorAll('.route-link')];

        function stateFromHash() {
          const raw = location.hash.startsWith('#/') ? location.hash.slice(2) : '';
          const [candidate] = raw.split('?');
          const route = validRoutes.includes(candidate) ? candidate : document.body.dataset.initialRoute;
          return { route };
        }

        function render() {
          const { route } = stateFromHash();
          pages.forEach(page => { page.hidden = page.dataset.page !== route; });
          routeLinks.forEach(link => {
            if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
          });
        }

        if (!location.hash) history.replaceState(null, '', \`#/\${document.body.dataset.initialRoute}\`);
        addEventListener('hashchange', render);
        render();
      })();
    `;
    const design = createAsset({
      html: `<!doctype html><html><head><title>Wireframe 3 route</title></head><body data-initial-route="case-study"><a class="route-link" data-route="about" href="#/about">About</a><article data-page="case-study">Case study</article><article data-page="about">About page</article><script>${wireframe3Bootstrap}</script></body></html>`,
      title: "Wireframe 3 route bootstrap",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Wireframe", record: design }}
      />,
    );

    const preview = screen.getByTitle(
      "Wireframe 3 route bootstrap HTML preview",
    );
    const srcdoc = preview.getAttribute("srcdoc") ?? "";
    const srcdocDocument = new DOMParser().parseFromString(srcdoc, "text/html");
    const navigationBridge = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes('a.route-link[href^="#/"]'),
    )?.textContent;
    const artifactBootstrap = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes("const validRoutes"),
    )?.textContent;

    expect(preview).toHaveAttribute("sandbox", "allow-scripts");
    expect(srcdoc).toContain("Content-Security-Policy");
    expect(navigationBridge).toBeTruthy();
    expect(artifactBootstrap).toBeTruthy();

    const previewFrame = document.createElement("iframe");
    previewFrame.setAttribute("sandbox", "allow-scripts");
    document.body.append(previewFrame);
    const previewWindow = previewFrame.contentWindow as
      | (Window & typeof globalThis)
      | null;

    if (!previewWindow || !navigationBridge || !artifactBootstrap) {
      throw new Error("JSDOM iframe preview runtime was not initialized");
    }

    previewWindow.document.body.dataset.initialRoute = "case-study";
    previewWindow.document.body.innerHTML =
      '<a class="route-link" data-route="about" href="#/about">About</a><article data-page="case-study">Case study</article><article data-page="about">About page</article>';

    /** Chromium의 opaque about:srcdoc가 hash-only History API를 거절하는 경계. */
    const replaceState = vi
      .spyOn(previewWindow.history, "replaceState")
      .mockImplementation(() => {
        throw new previewWindow.DOMException(
          "Sandboxed about:srcdoc cannot replace history state",
          "SecurityError",
        );
      });

    previewWindow.eval(navigationBridge);
    let bootstrapError: unknown;
    try {
      previewWindow.eval(artifactBootstrap);
    } catch (error) {
      bootstrapError = error;
    }

    expect(replaceState).toHaveBeenCalledWith(
      null,
      "",
      "about:srcdoc#/case-study",
    );
    expect(previewWindow.location.hash).toBe("#/case-study");
    expect(bootstrapError).toBeUndefined();
    expect(
      previewWindow.document.querySelector<HTMLElement>(
        '[data-page="case-study"]',
      )?.hidden,
    ).toBe(false);
    expect(
      previewWindow.document.querySelector<HTMLElement>('[data-page="about"]')
        ?.hidden,
    ).toBe(true);

    const routeLink = previewWindow.document.querySelector("a.route-link");
    const navigationAllowed = routeLink?.dispatchEvent(
      new previewWindow.MouseEvent("click", {
        bubbles: true,
        cancelable: true,
      }),
    );
    await new Promise<void>((resolve) => previewWindow.setTimeout(resolve, 0));

    expect(navigationAllowed).toBe(false);
    expect(previewWindow.location.hash).toBe("#/about");
    expect(
      previewWindow.document.querySelector<HTMLElement>(
        '[data-page="case-study"]',
      )?.hidden,
    ).toBe(true);
    expect(
      previewWindow.document.querySelector<HTMLElement>('[data-page="about"]')
        ?.hidden,
    ).toBe(false);

    previewFrame.remove();
  });

  it("History bridge는 비-hash URL을 그대로 전달하고 일반 오류를 숨기지 않는다", () => {
    const design = createAsset({
      html: '<!doctype html><html><head><title>History bridge</title></head><body><a class="route-link" href="#/home">Home</a></body></html>',
      title: "History bridge boundaries",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Asset", record: design }}
      />,
    );

    const srcdoc =
      screen
        .getByTitle("History bridge boundaries HTML preview")
        .getAttribute("srcdoc") ?? "";
    const srcdocDocument = new DOMParser().parseFromString(srcdoc, "text/html");
    const navigationBridge = Array.from(srcdocDocument.scripts).find((script) =>
      script.textContent.includes('a.route-link[href^="#/"]'),
    )?.textContent;
    expect(navigationBridge).toBeTruthy();

    const previewFrame = document.createElement("iframe");
    document.body.append(previewFrame);
    const previewWindow = previewFrame.contentWindow as
      | (Window & typeof globalThis)
      | null;

    if (!previewWindow || !navigationBridge) {
      throw new Error("JSDOM iframe preview runtime was not initialized");
    }

    const replaceState = vi
      .spyOn(previewWindow.history, "replaceState")
      .mockImplementation(() => undefined);
    const unexpectedFailure = new previewWindow.TypeError(
      "Unexpected history failure",
    );
    const pushState = vi
      .spyOn(previewWindow.history, "pushState")
      .mockImplementation(() => {
        throw unexpectedFailure;
      });

    previewWindow.eval(navigationBridge);

    const externalState = { source: "artifact" };
    previewWindow.history.replaceState(
      externalState,
      "External route",
      "/external",
    );
    expect(replaceState).toHaveBeenCalledWith(
      externalState,
      "External route",
      "/external",
    );

    expect(() =>
      previewWindow.history.pushState(null, "Hash route", "#/home"),
    ).toThrow(unexpectedFailure);
    expect(pushState).toHaveBeenCalledWith(
      null,
      "Hash route",
      "about:srcdoc#/home",
    );

    previewFrame.remove();
  });
});

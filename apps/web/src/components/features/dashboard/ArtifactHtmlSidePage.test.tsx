import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createDesign } from "@/test/fixtures/dashboard";
import { ArtifactHtmlSidePage } from "./ArtifactHtmlSidePage";

describe("ArtifactHtmlSidePage", () => {
  it("주석의 fake head보다 앞선 실제 protected head를 한 번만 생성한다", () => {
    const design = createDesign({
      html: '<!doctype html><html><!-- <head></head> --><body class="preview"><script src="https://evil.invalid/x.js"></script><main>Adversarial</main></body></html>',
      title: "Adversarial document",
    });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Design", record: design }}
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
    expect(srcdoc?.match(/window\.parent\.postMessage/g)).toHaveLength(1);
    expect(srcdoc).toContain('body class="preview"');
    expect(srcdoc).toContain(
      '<script src="https://evil.invalid/x.js"></script><main>Adversarial</main>',
    );
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain("script-src 'unsafe-inline'");
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
    const design = createDesign({ html, title });

    render(
      <ArtifactHtmlSidePage
        onClose={vi.fn()}
        selection={{ kind: "Design", record: design }}
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
});

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const source = (relativePath) =>
  readFileSync(join(webRoot, "src", relativePath), "utf8");

test("Artifact Workbench theme은 charcoal/burgundy/warm-white light palette를 사용한다", () => {
  const globals = source("app/globals.css");
  const expectedTokens = {
    "color-accent": "#A54A5A",
    "color-canvas": "#F3F0EC",
    "color-focus": "#8C2138",
    "color-focus-dark": "#F2C5CD",
    "color-ink": "#211D1D",
    "color-line": "#D8D1CB",
    "color-muted": "#5D5654",
    "color-primary": "#6B1E2E",
    "color-primary-hover": "#541622",
    "color-sidebar": "#292A2C",
    "color-sidebar-hover": "#36373A",
    "color-sidebar-selected": "#5F1F2E",
    "color-surface": "#FFFCF8",
    "color-surface-muted": "#F6F2ED",
  };

  for (const [token, value] of Object.entries(expectedTokens)) {
    assert.match(
      globals,
      new RegExp(`--${token}:\\s*${value.replace("#", "\\#")}\\s*;`, "i"),
      `${token}은 exec-80b charcoal/burgundy/warm-white 기준값 ${value}를 사용해야 한다`,
    );
  }

  assert.match(globals, /color-scheme:\s*light\s*;/i);
  assert.doesNotMatch(globals, /color-scheme:\s*dark\s*;/i);
});

test("Artifact Workbench theme은 이전 forest/gold·dark literal과 blue 계열 토큰을 남기지 않는다", () => {
  const globals = source("app/globals.css");
  const stalePaletteLiterals = [
    "#F3F0E8",
    "#173C2E",
    "#284B38",
    "#315845",
    "#8A5700",
    "#D29A2B",
    "#F2E5C3",
    "#0b0e13",
    "#0e1218",
    "#11161e",
    "#151b24",
    "#1a222d",
    "#1b2a3b",
    "#283241",
    "#3c4a5f",
    "#182a40",
    "#172019",
    "#211b12",
    "#2a171b",
    "#241d32",
    "#152726",
  ];

  for (const literal of stalePaletteLiterals) {
    assert.doesNotMatch(
      globals,
      new RegExp(literal.replace("#", "\\#"), "i"),
      `이전 palette literal ${literal}을 제거해야 한다`,
    );
  }

  for (const family of ["blue", "navy", "cyan", "teal"]) {
    assert.doesNotMatch(
      globals,
      new RegExp(`--color-${family}(?:-[a-z0-9-]+)?\\b`, "i"),
      `${family} 색상 토큰을 제거해야 한다`,
    );
  }
});

test("활성 dashboard UI class는 제거된 blue·violet·teal utility를 참조하지 않는다", () => {
  const dashboardSources = [
    "components/features/dashboard/ArtifactWorkbench.tsx",
    "components/features/dashboard/ArtifactHtmlSidePage.tsx",
  ];

  for (const relativePath of dashboardSources) {
    const component = source(relativePath);

    assert.doesNotMatch(
      component,
      /(?:bg|text|border|ring)-(?:blue|navy|cyan|teal|violet)(?:-|\/|\b)/i,
      `${relativePath}는 제거된 색상 utility 대신 semantic token을 사용해야 한다`,
    );
  }
});

const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const source = (relativePath) =>
  readFileSync(join(webRoot, "src", relativePath), "utf8");

test("Artifact Workbench theme은 기준 HTML의 dark palette와 control radius를 유지한다", () => {
  const globals = source("app/globals.css");
  const expectedTokens = {
    "color-canvas": "#0b0e13",
    "color-danger": "#ff8f9f",
    "color-focus": "#a9d1ff",
    "color-hover": "#1a222d",
    "color-ink": "#edf3fb",
    "color-line": "#283241",
    "color-line-strong": "#3c4a5f",
    "color-muted": "#9ba9ba",
    "color-primary": "#79b8ff",
    "color-primary-soft": "#182a40",
    "color-selected": "#1b2a3b",
    "color-sidebar": "#0e1218",
    "color-subtle": "#6f7e91",
    "color-success": "#b6e875",
    "color-surface": "#11161e",
    "color-surface-muted": "#151b24",
    "color-warning": "#f1c16f",
  };

  for (const [token, value] of Object.entries(expectedTokens)) {
    assert.match(
      globals,
      new RegExp(`--${token}:\\s*${value.replace("#", "\\#")}\\s*;`),
      `${token}은 기준 시안의 ${value}를 사용해야 한다`,
    );
  }

  assert.match(globals, /--radius-card:\s*0\.5rem\s*;/);
  assert.match(globals, /color-scheme:\s*dark\s*;/);
});

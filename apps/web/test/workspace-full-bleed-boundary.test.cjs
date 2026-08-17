const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const source = (relativePath) =>
  readFileSync(join(webRoot, "src", relativePath), "utf8");

function exportedWorkspaceRootClass(componentSource, componentName) {
  const match = componentSource.match(
    new RegExp(
      `export\\s+function\\s+${componentName}\\b[\\s\\S]*?return\\s*\\([\\s\\S]*?<section\\b[^>]*?className=["']([^"']+)["']`,
    ),
  );

  assert.ok(match, `${componentName}의 root section class를 찾을 수 있어야 한다`);
  return match[1];
}

function assertFullBleedRoot(rootClass, componentName) {
  for (const token of ["flex", "min-h-0", "flex-1", "flex-col", "bg-surface"]) {
    assert.match(
      rootClass,
      new RegExp(`(?:^|\\s)${token.replace("-", "\\-")}(?:\\s|$)`),
      `${componentName} root는 ${token}으로 탭 아래 가용 영역을 채워야 한다`,
    );
  }

  assert.doesNotMatch(
    rootClass,
    /(?:^|\s)(?:rounded-card|border|max-w-\S+|min-h-\[\d+(?:\.\d+)?rem\])(?:\s|$)/,
    `${componentName} root는 card·고정 폭·rem 기반 제한 높이를 두지 않아야 한다`,
  );
}

function emptyWorkspaceRootClasses(componentSource, helperName) {
  const helper = componentSource.match(
    new RegExp(`function\\s+${helperName}\\b[\\s\\S]*?\\n}\\n\\n`),
  );
  assert.ok(helper, `${helperName} source를 찾을 수 있어야 한다`);

  const classes = [...helper[0].matchAll(
    /<section\b[^>]*className=["']([^"']+)["']/g,
  )].map((match) => match[1]);
  assert.equal(classes.length, 2, `${helperName}의 legacy와 empty root가 필요하다`);
  return classes;
}

test("Artifact Workbench header는 full-width 첫 행이고 body는 230px Explorer·Records·detail 열이다", () => {
  const workbench = source(
    "components/features/dashboard/ArtifactWorkbench.tsx",
  );
  const detailPaneOpeningTag = workbench.match(
    /<aside\b[^>]*aria-labelledby=["']detail-heading["'][^>]*>/,
  );
  const headerClass = workbench.match(
    /<header\b[^>]*className=["']([^"']+)["'][^>]*>/,
  );
  const mainOpeningTag = workbench.match(/<main\b[^>]*>/);
  const projectPickerColumnClass = workbench.match(
    /<div\b[^>]*className=["']([^"']+)["'][^>]*>\s*<ProjectPicker\b/,
  );

  assert.match(
    workbench,
    /className=\{`[^`]*\bgrid\b[^`]*\bgrid-rows-\[58px_minmax\(0,1fr\)\][^`]*`\}[\s\S]*?<header\b[\s\S]*?<main\b/,
    "viewport root는 full-width header와 body를 58px/remaining 행으로 배치해야 한다",
  );
  assert.ok(headerClass, "header class를 찾을 수 있어야 한다");
  assert.match(
    headerClass[1],
    /(?:^|\s)md:pl-0(?:\s|$)/,
    "desktop header는 Explorer 경계에서 시작하도록 왼쪽 padding을 제거해야 한다",
  );
  assert.ok(
    projectPickerColumnClass,
    "ProjectPicker column class를 찾을 수 있어야 한다",
  );
  for (const token of ["md:w-[230px]", "md:px-2"]) {
    assert.match(
      projectPickerColumnClass[1],
      new RegExp(`(?:^|\\s)${token.replace(/[()[\].-]/g, "\\$&")}(?:\\s|$)`),
      `ProjectPicker column은 Explorer와 정렬되는 ${token}을 가져야 한다`,
    );
  }
  assert.doesNotMatch(
    projectPickerColumnClass[1],
    /(?:^|\s)md:w-\[250px\](?:\s|$)/,
  );
  assert.ok(mainOpeningTag, "main opening tag를 찾을 수 있어야 한다");
  for (const token of [
    "min-h-0",
    "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]",
  ]) {
    assert.match(
      mainOpeningTag[0],
      new RegExp(token.replace(/[()[\].-]/g, "\\$&")),
      `main body는 Explorer·Records·Detail을 위한 ${token}을 가져야 한다`,
    );
  }
  assert.doesNotMatch(workbench, /lg:grid-cols-\[270px_minmax\(0,1fr\)\]/);
  assert.match(
    workbench,
    /["']--detail-pane-width["']:\s*`\$\{[^}]+\}%`/,
    "detail pane CSS 변수는 viewport에 따라 계산되는 percentage를 사용해야 한다",
  );
  assert.match(
    workbench,
    /<\/section>\s*<aside\b[^>]*aria-labelledby=["']detail-heading["'][\s\S]*?<\/aside>\s*<\/main>/,
    "detail pane은 header 아래 body grid의 Records 형제여야 한다",
  );
  assert.ok(detailPaneOpeningTag, "detail pane opening tag를 찾을 수 있어야 한다");
  assert.match(
    detailPaneOpeningTag[0],
    /(?:^|\s)h-full(?:\s|$)/,
    "detail pane은 header 아래 body grid의 전체 높이를 차지해야 한다",
  );
  assert.doesNotMatch(
    detailPaneOpeningTag[0],
    /h-dvh|min-h-\[calc\(100dvh-58px\)\]|(?:^|\s)(?:fixed|absolute|z-\S+)(?:\s|$)/,
    "detail pane은 body row를 넘거나 overlay로 header를 덮으면 안 된다",
  );
});

test("Project loading shell도 resolved workspace와 같은 full-bleed geometry를 유지한다", () => {
  const loading = source("app/projects/[projectId]/loading.tsx");
  const contentColumn = loading.match(
    /<\/aside>\s*<div\s+className=["']([^"']+)["']/,
  );

  assert.ok(contentColumn, "loading main content column을 찾을 수 있어야 한다");
  assert.doesNotMatch(contentColumn[1], /(?:^|\s)(?:mx-auto|max-w-\S+)/);
  assert.match(
    loading,
    /className=["'][^"']*\bmin-w-0\b[^"']*\blg:h-dvh\b[^"']*\blg:overflow-hidden\b[^"']*["']/,
    "loading main column도 desktop viewport height를 유지해야 한다",
  );
  assert.match(
    loading,
    /className=["'][^"']*\bflex\b[^"']*\bmin-h-dvh\b[^"']*\bw-full\b[^"']*\bflex-col\b[^"']*\blg:h-full\b[^"']*["']/,
    "loading content shell도 resolved content shell과 같은 full-width flex column이어야 한다",
  );
});

test("Plan·Research browser root는 둥근 card가 아닌 full-bleed split workspace다", () => {
  const browser = source("components/features/dashboard/ArtifactBrowser.tsx");

  assertFullBleedRoot(
    exportedWorkspaceRootClass(browser, "ArtifactBrowser"),
    "ArtifactBrowser",
  );
  assert.doesNotMatch(
    browser,
    /md:min-h-\[36rem\]/,
    "split browser는 36rem 최소 높이 대신 부모의 가용 높이를 사용해야 한다",
  );
  assert.match(
    browser,
    /className=["'][^"']*\bgrid\b[^"']*\bmin-h-0\b[^"']*\bflex-1\b[^"']*\blg:grid-cols-\[minmax\(20rem,1fr\)_22\.5rem\][^"']*["']/,
    "Plan·Research body는 mobile에서도 bounded grid이고 desktop에서는 유동 list와 고정 inspector split이어야 한다",
  );
  assert.match(
    browser,
    /className=\{`(?=[^`]*\bmin-h-0\b)(?=[^`]*\boverflow-y-auto\b)[^`]*\$\{selectedEntry\s*\?\s*["']hidden["']\s*:\s*["']block["'][^`]*`\}/,
    "list pane은 가용 높이 안에서 자체 스크롤해야 한다",
  );
  assert.match(
    browser,
    /className=\{`(?=[^`]*\bmin-h-0\b)(?=[^`]*\boverflow-y-auto\b)[^`]*\$\{selectedEntry\s*\?\s*["']block["']\s*:\s*["']hidden\s+lg:flex["'][^`]*`\}/,
    "detail pane은 가용 높이 안에서 자체 스크롤해야 한다",
  );
});

test("Architecture root는 카드 wrapper 없이 full-bleed canvas를 제공한다", () => {
  const architecture = source(
    "components/features/dashboard/ArchitectureWorkspace.tsx",
  );

  assertFullBleedRoot(
    exportedWorkspaceRootClass(architecture, "ArchitectureWorkspace"),
    "ArchitectureWorkspace",
  );
  assert.match(
    architecture,
    /className=["'][^"']*\bmin-h-0\b[^"']*\bflex-1\b[^"']*\boverflow-y-auto\b[^"']*["']/,
    "Architecture content는 workspace 안에서 자체 세로 스크롤해야 한다",
  );
  for (const [workspace, helperName] of [
    [architecture, "EmptyArchitecture"],
  ]) {
    for (const rootClass of emptyWorkspaceRootClasses(workspace, helperName)) {
      assert.match(rootClass, /(?:^|\s)min-h-0(?:\s|$)/);
      assert.match(rootClass, /(?:^|\s)flex-1(?:\s|$)/);
      assert.match(
        rootClass,
        /(?:^|\s)overflow-y-auto(?:\s|$)/,
        `${helperName}의 legacy와 empty root 모두 mobile 세로 스크롤을 소유해야 한다`,
      );
    }
  }
});

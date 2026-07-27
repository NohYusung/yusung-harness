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

test("Artifact Workbench detail은 header/content shell을 밀어내는 viewport 형제 열이다", () => {
  const workbench = source(
    "components/features/dashboard/ArtifactWorkbench.tsx",
  );
  const detailPaneOpeningTag = workbench.match(
    /<aside\b[^>]*aria-labelledby=["']detail-heading["'][^>]*>/,
  );
  const mainOpeningTag = workbench.match(/<main\b[^>]*>/);

  assert.match(
    workbench,
    /md:grid-cols-\[minmax\(0,1fr\)_var\(--detail-pane-width\)\]/,
    "viewport root는 content shell과 detail pane을 별도 열로 배치해야 한다",
  );
  assert.match(
    workbench,
    /className=["'][^"']*\bgrid\b[^"']*\bmin-w-0\b[^"']*\bgrid-rows-\[58px_minmax\(0,1fr\)\][^"']*["'][\s\S]*?<header\b[\s\S]*?<main\b/,
    "공통 header와 main은 같은 content shell 안에 있어 함께 밀려야 한다",
  );
  assert.ok(mainOpeningTag, "main opening tag를 찾을 수 있어야 한다");
  for (const token of [
    "min-h-0",
    "md:grid-cols-[230px_minmax(0,1fr)]",
    "lg:grid-cols-[270px_minmax(0,1fr)]",
  ]) {
    assert.match(
      mainOpeningTag[0],
      new RegExp(token.replace(/[()[\].-]/g, "\\$&")),
      `main은 Explorer와 Records 두 pane을 위한 ${token}을 가져야 한다`,
    );
  }
  assert.doesNotMatch(
    mainOpeningTag[0],
    /var\(--detail-pane-width\)/,
    "detail pane 폭은 main 내부의 세 번째 열로 잡으면 안 된다",
  );
  assert.match(
    workbench,
    /["']--detail-pane-width["']:\s*`\$\{[^}]+\}%`/,
    "detail pane CSS 변수는 viewport에 따라 계산되는 percentage를 사용해야 한다",
  );
  assert.match(
    workbench,
    /<\/main>\s*<\/div>\s*<aside\b[^>]*aria-labelledby=["']detail-heading["']/,
    "detail pane은 main을 감싼 content shell과 직접 형제여야 한다",
  );
  assert.ok(detailPaneOpeningTag, "detail pane opening tag를 찾을 수 있어야 한다");
  assert.match(
    detailPaneOpeningTag[0],
    /(?:^|\s)(?:h-dvh|h-full)(?:\s|$)/,
    "detail pane은 공통 header 아래가 아닌 viewport 전체 높이를 차지해야 한다",
  );
  assert.doesNotMatch(
    detailPaneOpeningTag[0],
    /min-h-\[calc\(100dvh-58px\)\]|(?:^|\s)(?:fixed|absolute|z-\S+)(?:\s|$)/,
    "detail pane은 header 높이를 빼거나 z-index overlay로 header를 덮으면 안 된다",
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

test("Plan·Draft browser root는 둥근 card가 아닌 full-bleed split workspace다", () => {
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
    "Plan·Draft body는 mobile에서도 bounded grid이고 desktop에서는 유동 list와 고정 inspector split이어야 한다",
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

test("Domain과 Architecture root는 카드 wrapper 없이 full-bleed canvas를 제공한다", () => {
  const domain = source("components/features/dashboard/DomainWorkspace.tsx");
  const architecture = source(
    "components/features/dashboard/ArchitectureWorkspace.tsx",
  );

  assertFullBleedRoot(
    exportedWorkspaceRootClass(domain, "DomainWorkspace"),
    "DomainWorkspace",
  );
  assertFullBleedRoot(
    exportedWorkspaceRootClass(architecture, "ArchitectureWorkspace"),
    "ArchitectureWorkspace",
  );
  assert.doesNotMatch(
    domain,
    /className=["'][^"']*min-h-\[32rem\][^"']*["']/,
    "Domain canvas는 32rem 최소 높이 대신 부모의 가용 높이를 사용해야 한다",
  );
  assert.match(
    architecture,
    /className=["'][^"']*\bmin-h-0\b[^"']*\bflex-1\b[^"']*\boverflow-y-auto\b[^"']*["']/,
    "Architecture content는 workspace 안에서 자체 세로 스크롤해야 한다",
  );
  assert.match(
    domain,
    /selectedEntity[\s\S]*?\?\s*["'][^"']*\bmin-h-0\b[^"']*\bflex-1\b[^"']*\boverflow-y-auto\b[^"']*\blg:grid\b[^"']*\blg:grid-cols-\[minmax\(0,1fr\)_20rem\][^"']*\blg:overflow-hidden\b[^"']*["']/,
    "Domain selected layout은 mobile에서 전체를 스크롤하고 desktop에서 canvas와 aside를 bounded 해야 한다",
  );
  for (const [workspace, helperName] of [
    [domain, "EmptyDomain"],
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
  assert.match(
    domain,
    /\{latest\.legacyRecords\.length\s*>\s*0[\s\S]*?<div\s+className=["'][^"']*\bmax-h-48\b[^"']*\bshrink-0\b[^"']*\boverflow-y-auto\b[^"']*["']/,
    "valid Domain의 legacy footer는 bounded 자체 스크롤 영역이어야 한다",
  );
});

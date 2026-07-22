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

test("Dashboard는 헤더·탭과 full-bleed workspace를 세로 가용 높이로 조립한다", () => {
  const dashboard = source("components/features/dashboard/Dashboard.tsx");

  assert.match(
    dashboard,
    /<main\b[^>]*className=["'][^"']*\bmin-w-0\b[^"']*\blg:h-dvh\b[^"']*\blg:overflow-hidden\b[^"']*["']/,
    "desktop main은 viewport 높이를 소유하고 page overflow를 막아야 한다",
  );
  assert.match(
    dashboard,
    /<main\b[^>]*>[\s\S]*?<div\b[^>]*className=["'][^"']*\bflex\b[^"']*\bmin-h-dvh\b[^"']*\bw-full\b[^"']*\bflex-col\b[^"']*\blg:h-full\b[^"']*["']/,
    "main 직계 content shell은 폭 전체와 세로 가용 높이를 소유해야 한다",
  );
  assert.match(
    dashboard,
    /className=["'][^"']*\bflex\b[^"']*\bmin-h-0\b[^"']*\bflex-1\b[^"']*\boverflow-hidden\b[^"']*["'][\s\S]*?<DomainWorkspace\b[\s\S]*?<ArchitectureWorkspace\b[\s\S]*?<ArtifactBrowser\b/,
    "세 workspace는 max-width container 밖의 같은 full-bleed flex 영역을 사용해야 한다",
  );
  assert.doesNotMatch(
    dashboard,
    /className=["'][^"']*(?:\bmx-auto\b|\bmax-w-)/,
    "Dashboard shell은 centered 또는 max-width 폭 제한을 두지 않아야 한다",
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

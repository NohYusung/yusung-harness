const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const sourcePath = (relativePath) => join(webRoot, "src", relativePath);
const source = (relativePath) => {
  const path = sourcePath(relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};
const productSources = (relativeDirectory) => {
  const directoryPath = sourcePath(relativeDirectory);
  const files = [];

  assert.equal(
    existsSync(directoryPath),
    true,
    `${relativeDirectory}가 존재해야 한다`,
  );

  const visit = (currentPath, currentRelativePath) => {
    for (const entry of readdirSync(currentPath, { withFileTypes: true })) {
      const entryPath = join(currentPath, entry.name);
      const entryRelativePath = join(currentRelativePath, entry.name);

      if (entry.isDirectory()) {
        visit(entryPath, entryRelativePath);
      } else if (
        /\.(?:ts|tsx)$/.test(entry.name) &&
        !/\.test\.(?:ts|tsx)$/.test(entry.name)
      ) {
        files.push({
          content: readFileSync(entryPath, "utf8"),
          relativePath: entryRelativePath,
        });
      }
    }
  };

  visit(directoryPath, relativeDirectory);
  return files;
};

const artifactRelations = [
  "plans",
  "tasks",
  "drafts",
  "domains",
  "architectures",
  "wireframes",
  "assets",
  "designs",
  "reviews",
];

test("dashboard DTO와 Zod schema는 프로젝트 목록과 9종 산출물 응답을 정의한다", () => {
  const types = source("types/dashboard.ts");
  const validation = source("lib/validations/dashboard.ts");

  assert.match(types, /export\s+(?:interface|type)\s+ProjectSummary\b/);
  assert.match(types, /export\s+(?:interface|type)\s+ProjectContext\b/);
  assert.match(validation, /\bz\.object\s*\(/);
  assert.match(validation, /export\s+const\s+projectSummarySchema\b/);
  assert.match(validation, /export\s+const\s+projectContextSchema\b/);

  for (const relation of artifactRelations) {
    assert.match(
      validation,
      new RegExp(`\\b${relation}\\s*:\\s*z\\.array\\s*\\(`),
      `${relation} 배열을 런타임에 검증해야 한다`,
    );
  }

  const taskType = types.match(/interface\s+Task\s*\{([\s\S]*?)\n\}/)?.[1];
  const planType = types.match(/interface\s+Plan[^\{]*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(taskType);
  assert.ok(planType);
  assert.doesNotMatch(taskType, /\b(?:assets|wireframes|designs):/);
  assert.match(planType, /\btasks:\s*Task\[\]/);
  assert.doesNotMatch(planType, /\b(?:assets|wireframes|designs|reviews):/);
  assert.match(validation, /tasks:\s*z\.array\s*\(\s*taskSchema\s*\)/);
  assert.match(types, /interface\s+HtmlArtifactDocument\b[\s\S]*?html:\s*string/);
  assert.match(types, /type\s+Asset\s*=\s*HtmlArtifactDocument/);
  const wireframeType = types.match(
    /interface\s+Wireframe\s+extends\s+HtmlArtifactDocument\s*\{([\s\S]*?)\n\}/,
  )?.[1];
  assert.ok(wireframeType);
  assert.match(wireframeType, /\bindex:\s*string/);
  assert.match(wireframeType, /\bparentId:\s*number\s*\|\s*null/);
  assert.doesNotMatch(wireframeType, /\bindex:\s*number/);
  assert.match(types, /interface\s+Design\s+extends\s+HtmlArtifactDocument/);
  assert.match(types, /type\s+Review\s*=\s*ArtifactDocument/);
  assert.doesNotMatch(types, /TaskLinkedHtmlArtifact|PlanLinkedDocument/);
  assert.match(validation, /html:\s*htmlDocumentSchema/);
});

test("API client는 project 목록과 9종 REST list의 Zod 조립 경계를 소유한다", () => {
  const api = source("lib/api.ts");

  assert.match(api, /(?:import\s+["']server-only["']|server-only)/);
  assert.match(api, /export\s+(?:async\s+)?function\s+getProjects\s*\(/);
  assert.match(api, /export\s+(?:async\s+)?function\s+getProjectDashboard\s*\(/);
  for (const helper of [
    "getPlans",
    "getTasks",
    "getDrafts",
    "getDomains",
    "getArchitectures",
    "getWireframes",
    "getAssets",
    "getDesigns",
    "getReviews",
  ]) {
    assert.match(api, new RegExp(`export\\s+(?:async\\s+)?function\\s+${helper}\\s*\\(`));
  }
  assert.doesNotMatch(api, /mcp-client|callHarnessTool|get_project/);
  assert.match(api, /HARNESS_API_URL/);
  assert.match(api, /\bfetch\s*\(/);
  assert.doesNotMatch(api, /`\$\{apiUrl\}\/projects\/\$\{projectId\}`/);
  assert.match(api, /cache:\s*["']no-store["']/);
  assert.match(api, /projectListResponseSchema/);
  assert.match(api, /Promise\.all\s*\(/);
});

test("derive helper는 9종 합계, task 진행률, plan 완료 수, 마지막 활동을 계산한다", () => {
  const dashboard = source("lib/dashboard.ts");

  assert.match(
    dashboard,
    /export\s+function\s+deriveDashboardSummary\s*\(/,
  );

  for (const relation of artifactRelations) {
    assert.match(
      dashboard,
      new RegExp(`\\b${relation}\\b`),
      `${relation}을 summary 계산에 반영해야 한다`,
    );
  }

  assert.match(dashboard, /COMPLETED/);
  assert.match(dashboard, /updatedAt/);
  assert.match(dashboard, /completedPlans/);
  assert.match(dashboard, /totalPlans/);
  assert.doesNotMatch(dashboard, /plans\s*\[\s*0\s*\]/);
});

test("App Router page는 목록 redirect/empty와 project Server Component 경계를 유지한다", () => {
  const home = source("app/page.tsx");
  const projectPage = source("app/projects/[projectId]/page.tsx");

  assert.doesNotMatch(home, /["']use client["']/);
  assert.match(home, /getProjects\s*\(/);
  assert.match(home, /redirect\s*\(/);
  assert.match(home, /projects(?:\.length|\s*\[\s*0\s*\])/);

  assert.doesNotMatch(projectPage, /["']use client["']/);
  assert.doesNotMatch(projectPage, /mcp-client|HarnessMcpError/);
  assert.match(projectPage, /export\s+default\s+async\s+function/);
  assert.match(
    projectPage,
    /await\s+(?:params\b|Promise\.all\s*\(\s*\[\s*params\b)/,
  );
  assert.match(projectPage, /getProjectDashboard\s*\(/);
  assert.doesNotMatch(projectPage, /getProjectContext|getProjects\s*\(/);
  assert.match(projectPage, /HarnessApiError/);
  assert.match(
    projectPage,
    /error\s+instanceof\s+HarnessApiError\s*&&\s*error\.status\s*===\s*404[\s\S]*?notFound\s*\(\s*\)/,
  );
  assert.match(projectPage, /<Dashboard\b/);
  assert.doesNotMatch(projectPage, /\bpeek\b|isOverviewPeekOpen/);
  assert.match(projectPage, /query\.taskId/);
  assert.match(projectPage, /:\s*["']plans["']/);
  assert.match(
    projectPage,
    /workspaceRelations\s*=\s*\[[^\]]*["']plans["'][^\]]*["']drafts["'][^\]]*["']domains["'][^\]]*["']architectures["'][^\]]*["']wireframes["'][^\]]*["']assets["'][^\]]*["']designs["']/s,
  );
});

test("Dashboard는 아홉 record type의 통합 Artifact Workbench를 조립한다", () => {
  const dashboard = source("components/features/dashboard/Dashboard.tsx");
  const workbench = source(
    "components/features/dashboard/ArtifactWorkbench.tsx",
  );
  const htmlSidePage = source(
    "components/features/dashboard/ArtifactHtmlSidePage.tsx",
  );

  assert.match(dashboard, /<ArtifactWorkbench\b/);
  assert.doesNotMatch(
    dashboard,
    /<ProjectSidebar\b|<DashboardHeader\b|<ProjectWorkspaceNav\b/,
  );
  assert.doesNotMatch(dashboard, /<Summary\b|deriveDashboardSummary/);
  assert.doesNotMatch(dashboard, /PipelineStrip|ArtifactSidePeek/);
  assert.equal(
    existsSync(sourcePath("components/features/dashboard/PipelineStrip.tsx")),
    false,
  );
  assert.equal(
    existsSync(sourcePath("components/features/dashboard/ArtifactSidePeek.tsx")),
    false,
  );
  assert.match(
    workbench,
    /relationOrder\s*:[^=]*=\s*\[[^\]]*["']plans["'][^\]]*["']tasks["'][^\]]*["']drafts["'][^\]]*["']domains["'][^\]]*["']architectures["'][^\]]*["']wireframes["'][^\]]*["']assets["'][^\]]*["']designs["'][^\]]*["']reviews["']/s,
  );
  assert.match(workbench, /aria-label=["']Project artifact tree["']/);
  assert.match(workbench, /aria-label=["']Artifact types["']/);
  assert.match(workbench, /aria-label=["']Artifact records["']/);
  assert.match(workbench, /aria-label=["']Record details["']/);
  assert.match(workbench, /<ArtifactHtmlPreviewFrame\b/);
  assert.doesNotMatch(workbench, /<ArtifactHtmlSidePage\b/);
  assert.doesNotMatch(workbench, /<details\b|<iframe\b/);
  assert.match(
    htmlSidePage,
    /export function ArtifactHtmlPreviewFrame\b/,
  );
  assert.match(
    htmlSidePage,
    /srcDoc=\{buildSandboxedPreviewHtml\(record\.html\)\}/,
  );
  assert.match(htmlSidePage, /role=["']separator["']/);
  assert.match(htmlSidePage, /onPointerDown/);
  assert.match(htmlSidePage, /sandbox=["']allow-scripts["']/);
  assert.match(htmlSidePage, /Content-Security-Policy/);
  assert.doesNotMatch(htmlSidePage, /dangerouslySetInnerHTML/);
});

test("dashboard 제품 코드는 수동 새로고침 제어를 조립하지 않는다", () => {
  const dashboardSources = productSources("components/features/dashboard");

  assert.equal(
    existsSync(sourcePath("components/features/dashboard/RefreshButton.tsx")),
    false,
  );

  for (const { content, relativePath } of dashboardSources) {
    assert.doesNotMatch(
      content,
      /\bRefreshButton\b/,
      `${relativePath}에서 RefreshButton을 조립하면 안 된다`,
    );
    assert.doesNotMatch(
      content,
      /["'`][^"'`\n]*(?:refresh|syncing|새로고침|동기화)[^"'`\n]*["'`]/i,
      `${relativePath}에서 수동 새로고침 UI를 렌더하면 안 된다`,
    );
  }
});

test("project route는 접근 가능한 loading/error boundary를 제공한다", () => {
  const loading = source("app/projects/[projectId]/loading.tsx");
  const error = source("app/projects/[projectId]/error.tsx");

  assert.match(loading, /aria-busy\s*=\s*(?:"true"|\{true\})/);
  assert.match(loading, /aria-hidden\s*=\s*(?:"true"|\{true\})/);
  assert.match(loading, /viewSkeletons\s*=\s*Array\.from\s*\(\s*\{\s*length:\s*7\s*\}/);
  assert.match(error, /^[\s\S]*["']use client["']/);
  assert.match(error, /role\s*=\s*["']alert["']/);
  assert.match(error, /reset\s*\(/);
});

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const sourcePath = (relativePath) => join(webRoot, "src", relativePath);
const source = (relativePath) => {
  const path = sourcePath(relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};

const artifactRelations = [
  "plans",
  "tasks",
  "drafts",
  "architectures",
  "wireframes",
  "assets",
  "designs",
  "reviews",
];

test("dashboard DTO와 Zod schema는 프로젝트 목록과 8종 산출물 응답을 정의한다", () => {
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
});

test("API client는 server-only fetch, no-store, non-2xx 오류, Zod parse를 소유한다", () => {
  const api = source("lib/api.ts");

  assert.match(api, /(?:import\s+["']server-only["']|server-only)/);
  assert.match(api, /export\s+async\s+function\s+getProjects\s*\(/);
  assert.match(api, /export\s+async\s+function\s+getProjectContext\s*\(/);
  assert.match(api, /fetch\s*\(/);
  assert.match(api, /cache\s*:\s*["']no-store["']/);
  assert.match(api, /response\.ok/);
  assert.match(api, /projectSummarySchema\.array\s*\(\s*\)\.(?:parse|parseAsync)\s*\(/);
  assert.match(api, /projectContextSchema\.(?:parse|parseAsync)\s*\(/);
  assert.match(api, /\/projects(?:["'`]|\?)/);
  assert.match(api, /\/projects\/\$\{projectId\}/);
});

test("derive helper는 8종 합계, task 진행률, 최신 plan, 마지막 활동을 계산한다", () => {
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
  assert.match(dashboard, /plans\s*\[\s*0\s*\]/);
});

test("App Router page는 목록 redirect/empty와 project Server Component 경계를 유지한다", () => {
  const home = source("app/page.tsx");
  const projectPage = source("app/projects/[projectId]/page.tsx");

  assert.doesNotMatch(home, /["']use client["']/);
  assert.match(home, /getProjects\s*\(/);
  assert.match(home, /redirect\s*\(/);
  assert.match(home, /projects(?:\.length|\s*\[\s*0\s*\])/);

  assert.doesNotMatch(projectPage, /["']use client["']/);
  assert.match(projectPage, /export\s+default\s+async\s+function/);
  assert.match(
    projectPage,
    /await\s+(?:params\b|Promise\.all\s*\(\s*\[\s*params\b)/,
  );
  assert.match(projectPage, /getProjectContext\s*\(/);
  assert.match(projectPage, /<Dashboard\b/);
});

test("Dashboard는 summary, pipeline, 8종 ArtifactBrowser를 조립한다", () => {
  const dashboard = source("components/features/dashboard/Dashboard.tsx");
  const artifactBrowser = source(
    "components/features/dashboard/ArtifactBrowser.tsx",
  );

  assert.match(dashboard, /<Summary\b/);
  assert.match(dashboard, /<PipelineStrip\b/);
  assert.match(dashboard, /<ArtifactBrowser\b/);

  for (const relation of artifactRelations) {
    assert.match(
      artifactBrowser,
      new RegExp(`["']${relation}["']`),
      `${relation} browser 항목이 있어야 한다`,
    );
  }
});

test("project route는 접근 가능한 loading/error boundary를 제공한다", () => {
  const loading = source("app/projects/[projectId]/loading.tsx");
  const error = source("app/projects/[projectId]/error.tsx");

  assert.match(loading, /aria-busy\s*=\s*(?:"true"|\{true\})/);
  assert.match(loading, /aria-hidden\s*=\s*(?:"true"|\{true\})/);
  assert.match(error, /^[\s\S]*["']use client["']/);
  assert.match(error, /role\s*=\s*["']alert["']/);
  assert.match(error, /reset\s*\(/);
});

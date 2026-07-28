const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const source = (relativePath) =>
  readFileSync(join(serverRoot, "src", relativePath), "utf8");
const prismaSource = (relativePath) =>
  readFileSync(join(serverRoot, "prisma", relativePath), "utf8");

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

test("MCP get_project는 projectId가 없을 때 dashboard 프로젝트 목록 service로 위임한다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  assert.match(mcpService, /"get_project"/);
  assert.match(mcpService, /projectId:\s*projectIdSchema\.optional\(\)/);
  assert.match(mcpService, /this\.projectsService\.list\s*\(\s*\)/);
  assert.match(mcpService, /readOnlyHint:\s*true/);
});

test("ProjectsService.list는 9종 산출물 count를 한 번에 조회한다", () => {
  const service = source("services/projects/projects.service.ts");

  assert.match(service, /\blist\s*\(\s*\)\s*\{/);
  assert.match(service, /this\.prisma\.project\.findMany\s*\(/);
  assert.match(service, /_count\s*:/);

  for (const relation of artifactRelations) {
    assert.match(
      service,
      new RegExp(`\\b${relation}\\s*:\\s*true\\b`),
      `${relation} count를 목록 응답에 포함해야 한다`,
    );
  }
});

test("Plan은 Task를 소유하되 Task는 산출물 역방향 relation을 소유하지 않는다", () => {
  const schema = prismaSource("schema.prisma");
  const task = schema.match(/model Task\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.match(schema, /model Plan\s*\{[\s\S]*?tasks\s+Task\[\]/);
  assert.ok(task, "Task 모델이 존재해야 한다");
  assert.doesNotMatch(task, /^\s*(?:assets|wireframes|designs)\s+/m);

  for (const model of ["Asset", "Wireframe", "Design"]) {
    const modelBlock = schema.match(
      new RegExp(`model ${model}\\s*\\{([\\s\\S]*?)\\n\\}`),
    )?.[1];

    assert.ok(modelBlock, `${model} 모델이 존재해야 한다`);
    assert.doesNotMatch(modelBlock, /^\s*taskId\s+/m);
    assert.doesNotMatch(modelBlock, /^\s*task\s+Task\b/m);
  }
});

test("Asset, Wireframe, Design은 content 대신 HTML 문서를 저장한다", () => {
  const schema = prismaSource("schema.prisma");

  for (const model of ["Asset", "Wireframe", "Design"]) {
    const modelBlock = schema.match(
      new RegExp(`model ${model}\\s*\\{([\\s\\S]*?)\\n\\}`),
    );

    assert.ok(modelBlock, `${model} 모델이 존재해야 한다`);
    assert.match(modelBlock[1], /\bhtml\s+String\b/);
    assert.doesNotMatch(modelBlock[1], /\bcontent\s+String\b/);
  }
});

test("HTML migration은 세 산출물 컬럼을 rename하고 legacy 값을 HTML로 변환한다", () => {
  const migration = prismaSource(
    "migrations/20260720100000_store_html_artifacts/migration.sql",
  );

  for (const model of ["Asset", "Wireframe", "Design"]) {
    assert.match(
      migration,
      new RegExp(`ALTER TABLE ["']${model}["'] RENAME COLUMN ["']content["'] TO ["']html["']`),
    );
    assert.match(
      migration,
      new RegExp(`UPDATE ["']${model}["'][\\s\\S]*?<!doctype html>`),
    );
  }

  for (const model of ["Plan", "Task", "Draft", "Architecture", "Review"]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`ALTER TABLE ["']${model}["'] RENAME COLUMN`),
    );
  }
});

test("dashboard mock 산출물은 ASCII 설명이 아닌 실제 UI HTML 화면을 제공한다", () => {
  const migration = prismaSource(
    "migrations/20260720103000_draw_mock_artifact_screens/migration.sql",
  );

  assert.equal(
    (migration.match(/data-mock-screen="asset-/g) ?? []).length,
    5,
  );
  assert.equal(
    (migration.match(/data-mock-screen="wireframe-/g) ?? []).length,
    4,
  );
  assert.equal(
    (migration.match(/data-mock-screen="design-/g) ?? []).length,
    4,
  );
  assert.ok(
    (migration.match(/<button\b[^>]*\btype="button"/g) ?? []).length >= 13,
  );
  assert.ok(
    (migration.match(/<nav\b[^>]*\baria-label=/g) ?? []).length >= 8,
  );
  assert.ok((migration.match(/data-ui="card"/g) ?? []).length >= 13);
  assert.ok((migration.match(/<script>/g) ?? []).length >= 8);
  assert.match(migration, /grid-template-columns/);
  assert.match(migration, /data-journey-step/);
  assert.doesNotMatch(migration, /<pre\b/);
  assert.doesNotMatch(
    migration,
    /\[(?:Project Select|Summary cards stacked|Sidebar 256px|Type Badge)\]/,
  );
});

test("Plan은 Task와 PlanWireframes 관계를 유지하고 나머지 산출물·Review relation을 제거한다", () => {
  const schema = prismaSource("schema.prisma");
  const plan = schema.match(/model Plan\s*\{([\s\S]*?)\n\}/)?.[1];

  assert.ok(plan, "Plan 모델이 존재해야 한다");
  assert.match(plan, /^\s*tasks\s+Task\[\]/m);
  assert.match(
    plan,
    /^\s*wireframes\s+Wireframe\[\]\s+@relation\("PlanWireframes"\)\s*$/m,
  );
  assert.doesNotMatch(plan, /^\s*(?:assets|designs|reviews)\s+/m);

  for (const model of ["Asset", "Wireframe", "Design", "Review"]) {
    const modelBlock = schema.match(
      new RegExp(`model ${model}\\s*\\{([\\s\\S]*?)\\n\\}`),
    )?.[1];

    assert.ok(modelBlock, `${model} 모델이 존재해야 한다`);
    assert.doesNotMatch(modelBlock, /^\s*planId\s+/m);
    assert.doesNotMatch(modelBlock, /^\s*plan\s+Plan\b/m);
  }
});

test("ProjectsService는 목록과 project 존재 검증만 소유하고 aggregate context를 조립하지 않는다", () => {
  const service = source("services/projects/projects.service.ts");

  assert.match(service, /\blist\s*\(\s*\)/);
  assert.match(service, /\bensureProject\s*\(/);
  assert.doesNotMatch(service, /\bAGENT\b|\bgetContext\s*\(|findUniqueOrThrow/);
});

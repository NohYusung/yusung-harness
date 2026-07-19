const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const source = (relativePath) =>
  readFileSync(join(serverRoot, "src", relativePath), "utf8");

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

test("GET /projects는 dashboard 프로젝트 목록 service로 위임한다", () => {
  const controller = source("projects/projects.controller.ts");

  assert.match(controller, /@Get\s*\(\s*\)\s*[\s\S]*?\blist\s*\(\s*\)/);
  assert.match(controller, /this\.projectsService\.list\s*\(\s*\)/);
  assert.match(controller, /@Get\s*\(\s*["']:projectId["']\s*\)/);
});

test("ProjectsService.list는 8종 산출물 count를 한 번에 조회한다", () => {
  const service = source("projects/projects.service.ts");

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

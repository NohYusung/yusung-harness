const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const readServerFile = (...segments) =>
  readFileSync(join(serverRoot, ...segments), "utf8");

test("Prisma Client는 legacy prisma-client-js 기본 출력 경로를 사용한다", () => {
  const schema = readServerFile("prisma", "schema.prisma");
  const generator = schema.match(/generator client \{[\s\S]*?\n\}/)?.[0];

  assert.ok(generator, "client generator가 존재해야 한다");
  assert.match(generator, /provider\s*=\s*["']prisma-client-js["']/);
  assert.doesNotMatch(generator, /\boutput\s*=/);
});

test("서버는 node_modules의 @prisma/client 공개 진입점을 사용한다", () => {
  const sourceFiles = [
    ["src", "prisma", "prisma.service.ts"],
    ["src", "services", "plans", "plans.service.ts"],
    ["src", "services", "projects", "projects.service.ts"],
    ["src", "services", "tasks", "tasks.service.ts"],
  ];

  for (const segments of sourceFiles) {
    const source = readServerFile(...segments);

    assert.match(source, /from ["']@prisma\/client["']/);
    assert.doesNotMatch(source, /generated\/prisma/);
  }
});

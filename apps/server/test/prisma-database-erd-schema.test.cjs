const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const schema = readFileSync(join(serverRoot, "prisma", "schema.prisma"), "utf8");

const modelBody = (modelName) => {
  const match = schema.match(
    new RegExp(`model\\s+${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`),
  );

  assert.ok(match, `${modelName} 모델이 존재해야 한다`);
  return match[1];
};

const assertProjectOwnedArtifact = (modelName) => {
  const model = modelBody(modelName);

  assert.match(
    model,
    /^\s*id\s+Int\s+@id\s+@default\(autoincrement\(\)\)\s*$/m,
  );
  assert.match(model, /^\s*projectId\s+Int\s*$/m);
  assert.match(
    model,
    /^\s*project\s+Project\s+@relation\(fields:\s*\[projectId\],\s*references:\s*\[id\]\)\s*$/m,
  );
  assert.match(model, /^\s*createdAt\s+DateTime\s+@default\(now\(\)\)\s*$/m);
  assert.match(model, /^\s*updatedAt\s+DateTime\s+@updatedAt\s*$/m);
  assert.match(model, /^\s*title\s+String\s*$/m);
  assert.match(model, /@@index\(\[projectId\]\)/);
};

test("Project는 DB와 ERD 역관계를 제공한다", () => {
  const project = modelBody("Project");

  assert.match(project, /^\s*databases\s+DB\[\]\s*$/m);
  assert.match(project, /^\s*erds\s+ERD\[\]\s*$/m);
});

test("DB는 프로젝트별 테이블 스키마 Markdown 계약을 제공한다", () => {
  const database = modelBody("DB");

  assertProjectOwnedArtifact("DB");
  assert.match(database, /^\s*content\s+String\s*$/m);
});

test("legacy Database 모델은 존재하지 않는다", () => {
  assert.doesNotMatch(schema, /(?:^|\n)\s*model\s+Database\s*\{/);
});

test("ERD는 공개 Dineug document와 비공개 legacy 원본 보존 계약을 제공한다", () => {
  const erd = modelBody("ERD");

  assertProjectOwnedArtifact("ERD");
  assert.match(erd, /^\s*document\s+String\?\s*$/m);
  assert.match(erd, /^\s*legacyScene\s+String\?\s*$/m);
  assert.match(erd, /^\s*legacyHtml\s+String\?\s*$/m);
  assert.doesNotMatch(erd, /^\s*scene\s+String\??\s*$/m);
  assert.doesNotMatch(erd, /^\s*html\s+String\??\s*$/m);
});

test("schema.prisma에는 처리되지 않은 AGENT 주석이 남지 않는다", () => {
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

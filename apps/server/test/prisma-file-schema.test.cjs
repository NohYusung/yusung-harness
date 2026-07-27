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

const fieldDeclaration = (model, fieldName) => {
  const match = model.match(new RegExp(`^\\s*${fieldName}\\s+(.+)$`, "m"));

  assert.ok(match, `${fieldName} 필드가 존재해야 한다`);
  return match[1].trim();
};

test("File은 프로젝트별 업로드 파일과 원격 저장소 전이 상태를 저장한다", () => {
  const project = modelBody("Project");
  const file = modelBody("File");
  const id = fieldDeclaration(file, "id");
  const projectRelation = fieldDeclaration(file, "project");
  const isUploaded = fieldDeclaration(file, "isUploaded");

  assert.match(project, /^\s*files\s+File\[\]\s*$/m);
  assert.match(id, /^Int\b/);
  assert.match(id, /@id\b/);
  assert.match(id, /@default\(autoincrement\(\)\)/);
  assert.match(file, /^\s*projectId\s+Int\s*$/m);
  assert.match(projectRelation, /^Project\b/);
  assert.match(projectRelation, /@relation\(/);
  assert.match(projectRelation, /fields:\s*\[projectId\]/);
  assert.match(projectRelation, /references:\s*\[id\]/);
  assert.match(file, /^\s*createdAt\s+DateTime\s+@default\(now\(\)\)\s*$/m);
  assert.match(file, /^\s*updatedAt\s+DateTime\s+@updatedAt\s*$/m);
  assert.match(file, /^\s*title\s+String\s*$/m);
  assert.match(file, /^\s*mimeType\s+String\s*$/m);
  assert.match(file, /^\s*size\s+Int\s*$/m);
  assert.match(file, /^\s*content\s+Bytes\?\s*$/m);
  assert.match(isUploaded, /^Boolean\b/);
  assert.match(isUploaded, /@default\(false\)/);
  assert.match(file, /^\s*uploadUrl\s+String\?\s*$/m);
  assert.match(file, /@@index\(\s*\[projectId\]\s*\)/);
  assert.doesNotMatch(file, /\bAGENT\b/);
});

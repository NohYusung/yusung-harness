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

const assertProjectRelation = (modelName, { standaloneIndex = true } = {}) => {
  const model = modelBody(modelName);

  assert.match(model, /^\s*projectId\s+Int\b/m);
  assert.match(
    model,
    /^\s*project\s+Project\s+@relation\(fields:\s*\[projectId\],\s*references:\s*\[id\]\)/m,
  );
  if (standaloneIndex) {
    assert.match(model, /@@index\(\[projectId\]\)/);
  } else {
    assert.doesNotMatch(model, /@@index\(\[projectId\]\)/);
  }
};

test("Asset, Design, Wireframe은 Plan·Task 필드와 index를 제거한다", () => {
  for (const modelName of ["Asset", "Design", "Wireframe"]) {
    const model = modelBody(modelName);

    for (const field of ["planId", "taskId"]) {
      assert.doesNotMatch(
        model,
        new RegExp(`^\\s*${field}\\s+`, "m"),
        `${modelName}.${field}를 제거해야 한다`,
      );
      assert.doesNotMatch(
        model,
        new RegExp(`@@index\\(\\[${field}\\]\\)`),
        `${modelName}.${field} index를 제거해야 한다`,
      );
    }
    assert.doesNotMatch(model, /^\s*plan\s+Plan\b/m);
    assert.doesNotMatch(model, /^\s*task\s+Task\b/m);
  }
});

test("Review는 Plan 필드와 index를 제거한다", () => {
  const review = modelBody("Review");

  assert.doesNotMatch(review, /^\s*planId\s+/m);
  assert.doesNotMatch(review, /^\s*plan\s+Plan\b/m);
  assert.doesNotMatch(review, /@@index\(\[planId\]\)/);
});

test("Plan과 Task는 제거된 산출물·Review 역방향 relation을 노출하지 않는다", () => {
  const plan = modelBody("Plan");
  const task = modelBody("Task");

  assert.match(plan, /^\s*tasks\s+Task\[\]/m);
  assert.doesNotMatch(plan, /^\s*(?:assets|wireframes|designs|reviews)\s+/m);
  assert.doesNotMatch(task, /^\s*(?:assets|wireframes|designs)\s+/m);
});

test("Project 소유권과 산출물 간 핵심 relation은 유지한다", () => {
  const project = modelBody("Project");
  const task = modelBody("Task");
  const asset = modelBody("Asset");
  const wireframe = modelBody("Wireframe");
  const design = modelBody("Design");

  for (const [field, type] of [
    ["assets", "Asset"],
    ["wireframes", "Wireframe"],
    ["designs", "Design"],
    ["reviews", "Review"],
  ]) {
    assert.match(project, new RegExp(`^\\s*${field}\\s+${type}\\[\\]`, "m"));
  }
  for (const modelName of ["Asset", "Design", "Review"]) {
    assertProjectRelation(modelName);
  }
  assertProjectRelation("Wireframe", { standaloneIndex: false });

  assert.match(task, /^\s*planId\s+Int\b/m);
  assert.match(
    task,
    /^\s*plan\s+Plan\s+@relation\(fields:\s*\[planId\],\s*references:\s*\[id\],\s*onDelete:\s*Cascade\)/m,
  );
  assert.match(asset, /^\s*designs\s+Design\[\]/m);
  assert.match(wireframe, /^\s*designs\s+Design\[\]/m);
  assert.match(wireframe, /^\s*index\s+String\s*$/m);
  assert.match(wireframe, /^\s*parentId\s+Int\?\s*$/m);
  assert.match(
    wireframe,
    /\bparent\s+Wireframe\?\s+@relation\(\s*"WireframeHierarchy"\s*,\s*fields:\s*\[parentId\]\s*,\s*references:\s*\[id\]\s*,\s*onDelete:\s*Restrict\s*,\s*onUpdate:\s*Cascade\s*\)/,
  );
  assert.match(
    wireframe,
    /^\s*children\s+Wireframe\[\]\s+@relation\("WireframeHierarchy"\)\s*$/m,
  );
  assert.match(wireframe, /@@index\(\[projectId,\s*index\]\)/);
  assert.match(wireframe, /@@index\(\[parentId\]\)/);
  assert.doesNotMatch(wireframe, /@@unique\(\[projectId,\s*index\]\)/);
  assert.match(design, /^\s*wireframeId\s+Int\b/m);
  assert.match(
    design,
    /^\s*wireframe\s+Wireframe\s+@relation\(fields:\s*\[wireframeId\],\s*references:\s*\[id\]\)/m,
  );
  assert.match(design, /@@index\(\[wireframeId\]\)/);
  assert.match(design, /^\s*assetId\s+Int\b/m);
  assert.match(
    design,
    /^\s*asset\s+Asset\s+@relation\(fields:\s*\[assetId\],\s*references:\s*\[id\]\)/m,
  );
  assert.match(design, /@@index\(\[assetId\]\)/);
});

test("schema.prisma에는 처리되지 않은 AGENT 주석이 남지 않는다", () => {
  assert.doesNotMatch(schema, /\bAGENT\b/);
});

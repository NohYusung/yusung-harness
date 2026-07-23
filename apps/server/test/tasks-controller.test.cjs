const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const controllerPath = join(
  __dirname,
  "..",
  "src",
  "services",
  "tasks",
  "tasks.controller.ts",
);

test("TasksController 목록 route는 project와 plan ID를 검증해 service에 전달한다", () => {
  const controller = readFileSync(controllerPath, "utf8");

  assert.match(controller, /@Controller\(["']tasks\/:projectId\/:planId["']\)/);
  assert.match(
    controller,
    /@Param\(["']projectId["'],\s*ParseIntPipe\)\s*projectId:\s*number/,
  );
  assert.match(
    controller,
    /@Param\(["']planId["'],\s*ParseIntPipe\)\s*planId:\s*number/,
  );
  assert.match(
    controller,
    /tasksService\.list\(\s*\{\s*projectId,\s*planId\s*\}\s*\)/,
  );
});

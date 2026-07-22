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

test("제거된 MCP long-poll의 SSE route와 subscriber를 남기지 않는다", () => {
  assert.equal(
    existsSync(sourcePath("app/api/projects/events/route.ts")),
    false,
  );
  assert.equal(
    existsSync(sourcePath("app/api/projects/[projectId]/events/route.ts")),
    false,
  );
  assert.equal(
    existsSync(
      sourcePath("components/features/dashboard/ProjectEventsSubscriber.tsx"),
    ),
    false,
  );
});

test("Dashboard와 REST API client는 MCP tool을 소비하지 않는다", () => {
  const dashboard = source("components/features/dashboard/Dashboard.tsx");
  const api = source("lib/api.ts");

  assert.doesNotMatch(dashboard, /ProjectEventsSubscriber|api\/projects\/events/);
  assert.doesNotMatch(
    api,
    /wait_for_project_changes|list_projects|get_project(?:_context)?|callHarnessTool|mcp-client/,
  );
});

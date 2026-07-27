const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const webRoot = join(__dirname, "..");
const source = (relativePath) => {
  const path = join(webRoot, "src", relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};

test("dashboard type과 schema는 Request count, lifecycle, context를 정의한다", () => {
  const types = source("types/dashboard.ts");
  const validation = source("lib/validations/dashboard.ts");

  assert.match(
    types,
    /export\s+type\s+RequestStatus\s*=\s*[\s\S]*?["']PENDING["'][\s\S]*?["']IN_PROGRESS["'][\s\S]*?["']COMPLETED["']/,
  );
  assert.match(
    types,
    /export\s+interface\s+Request\s+extends\s+ArtifactDocument\s*\{[\s\S]*?status:\s*RequestStatus/,
  );
  assert.match(types, /interface\s+ArtifactCounts\s*\{[\s\S]*?requests:\s*number/);
  assert.match(types, /interface\s+ProjectContext\s*\{[\s\S]*?requests:\s*Request\[\]/);

  assert.match(
    validation,
    /requestStatusSchema\s*=\s*z\.enum\s*\(\s*\[[\s\S]*?["']PENDING["'][\s\S]*?["']IN_PROGRESS["'][\s\S]*?["']COMPLETED["']/,
  );
  assert.match(validation, /requestSchema[\s\S]*?status:\s*requestStatusSchema/);
  assert.match(validation, /export\s+const\s+requestListResponseSchema\b/);
  assert.match(validation, /requests:\s*z\.number\(\)\.int\(\)\.nonnegative\(\)/);
  assert.match(validation, /requests:\s*z\.array\(\s*requestSchema\s*\)/);
});

test("API와 route는 Request REST list와 type=requests를 dashboard에 연결한다", () => {
  const api = source("lib/api.ts");
  const page = source("app/projects/[projectId]/page.tsx");

  assert.match(api, /\brequestListResponseSchema\b/);
  assert.match(api, /\bRequest\b/);
  assert.match(api, /export\s+function\s+getRequests\s*\(/);
  assert.match(
    api,
    /getProjectResource\s*\(\s*projectId\s*,\s*["']requests["']\s*,\s*requestListResponseSchema\s*\)/,
  );
  assert.match(api, /Promise\.all\s*\([\s\S]*?getRequests\s*\(\s*projectId\s*\)/);
  assert.match(api, /context:\s*\{[\s\S]*?requests\s*,/);
  assert.match(
    page,
    /workspaceRelations\s*=\s*\[[\s\S]*?["']requests["'][\s\S]*?\]\s+as\s+const/,
  );
});

test("ArtifactWorkbench는 Request 메뉴, count, status, record URL을 조립한다", () => {
  const browser = source(
    "components/features/dashboard/ArtifactBrowser.tsx",
  );
  const workbench = source(
    "components/features/dashboard/ArtifactWorkbench.tsx",
  );

  assert.match(
    browser,
    /export\s+type\s+WorkspaceRelation\s*=[\s\S]*?["']requests["']/,
  );
  assert.match(
    workbench,
    /relationOrder[\s\S]*?=[\s\S]*?\[[\s\S]*?["']requests["'][\s\S]*?\]/,
  );
  assert.match(
    workbench,
    /requests:\s*\{[\s\S]*?code:\s*["']RQ["'][\s\S]*?label:\s*["']Request["'][\s\S]*?plural:\s*["']Requests["']/,
  );
  assert.match(
    workbench,
    /getEntries\s*\([\s\S]*?requests:\s*readonly\s+Request\[\]\s*=\s*context\.requests[\s\S]*?entriesByRelation[\s\S]*?requests:\s*\[\.\.\.requests\]/,
  );
  assert.match(
    workbench,
    /entry\.relation\s*===\s*["']requests["'][\s\S]*?Request[\s\S]*?status/,
  );
  assert.match(workbench, /`\/projects\/\$\{context\.id\}\?type=\$\{relation\}`/);
  assert.match(workbench, /relationEntries\.length/);
});

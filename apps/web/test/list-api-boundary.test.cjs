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

test("Web API는 project 목록과 9종 project-scoped REST list helper를 제공한다", () => {
  const api = source("lib/api.ts");
  const validation = source("lib/validations/dashboard.ts");
  const resources = [
    ["Plans", "plans", "planListResponseSchema"],
    ["Tasks", "tasks", "taskListResponseSchema"],
    ["Research", "research", "researchListResponseSchema"],
    ["Domains", "domains", "domainListResponseSchema"],
    ["Architectures", "architectures", "architectureListResponseSchema"],
    ["Wireframes", "wireframes", "wireframeListResponseSchema"],
    ["Assets", "assets", "assetListResponseSchema"],
    ["Designs", "designs", "designListResponseSchema"],
    ["Reviews", "reviews", "reviewListResponseSchema"],
  ];

  assert.doesNotMatch(api, /mcp-client|callHarnessTool|get_project/);
  assert.match(api, /HARNESS_API_URL/);
  assert.match(api, /127\.0\.0\.1:4000/);
  assert.match(api, /fetch\s*\(\s*`\$\{apiUrl\}\/projects`/);
  assert.doesNotMatch(api, /`\$\{apiUrl\}\/projects\/\$\{projectId\}`/);
  assert.match(api, /cache:\s*["']no-store["']/);
  assert.match(api, /projectListResponseSchema\.parse\s*\(/);
  for (const [suffix, resource, schema] of resources) {
    const escapedResource = resource.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    assert.match(api, new RegExp(`export\\s+(?:async\\s+)?function\\s+get${suffix}\\s*\\(`));
    assert.match(api, new RegExp(`["']${escapedResource}["']`));
    assert.match(api, new RegExp(`\\b${schema}\\b`));
    assert.match(validation, new RegExp(`export\\s+const\\s+${schema}\\b`));
  }

  const getPlansBody = api.match(
    /export\s+(?:async\s+)?function\s+getPlans\s*\([^)]*\)[\s\S]*?\n}/,
  )?.[0] ?? "";
  assert.doesNotMatch(getPlansBody, /versionOrder|\bversion\b/);
});

test("getProjectDashboard는 선택한 plan 범위의 Task와 REST helper를 한 Promise.all에서 조립한다", () => {
  const api = source("lib/api.ts");
  const page = source("app/projects/[projectId]/page.tsx");
  const helpers = [
    "getProjects()",
    "getPlans(projectId)",
    "getTasks(projectId, selectedPlanId)",
    "getResearch(projectId)",
    "getDomains(projectId)",
    "getArchitectures(projectId)",
    "getWireframes(projectId)",
    "getAssets(projectId)",
    "getDesigns(projectId)",
    "getReviews(projectId)",
  ];

  assert.match(api, /export\s+(?:async\s+)?function\s+getProjectDashboard\s*\(/);
  const dashboardBody = api.slice(api.indexOf("getProjectDashboard"));
  const promiseAll = dashboardBody.match(/Promise\.all\s*\(\s*\[([\s\S]*?)\]\s*\)/)?.[1] ?? "";
  for (const helper of helpers) {
    assert.match(promiseAll, new RegExp(helper.replace(/[()]/g, "\\$&")));
  }
  assert.match(
    page,
    /getProjectDashboard\s*\(\s*projectId\s*,\s*selectedPlanId\s*,?\s*\)/,
  );
  assert.match(
    page,
    /selectedPlanId\s*=\s*[\s\S]*?activeRelation\s*===\s*["']plans["']\s*\?\s*selectedArtifactId\s*:\s*null/,
  );
  assert.doesNotMatch(page, /getProjectContext|getPlans|getTasks|getDrafts|getDomains|getArchitectures|getWireframes|getAssets|getDesigns|getReviews|Promise\.all\s*\(\s*\[\s*getProjects/);
  assert.match(page, /dynamic\s*=\s*["']force-dynamic["']/);
  assert.doesNotMatch(api, /getDrafts|draftListResponseSchema|["']drafts["']/);
  assert.doesNotMatch(api, /getArchitecturePlans|architecture-plans|architecturePlanListResponseSchema/);
  assert.doesNotMatch(api, /architecturePlans/);
});

test("Web 설정은 읽기 REST와 MCP transport URL을 각각 제공한다", () => {
  const env = readFileSync(join(webRoot, ".env.example"), "utf8");
  const packageJson = JSON.parse(
    readFileSync(join(webRoot, "package.json"), "utf8"),
  );

  assert.match(env, /HARNESS_MCP_URL=.*\/mcp/);
  assert.match(env, /HARNESS_API_URL=["']?http:\/\/127\.0\.0\.1:4000["']?/);
  assert.equal(packageJson.dependencies["@modelcontextprotocol/sdk"], "^1.29.0");
});

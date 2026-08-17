const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const sourcePath = (relativePath) => join(serverRoot, "src", relativePath);
const source = (relativePath) => readFileSync(sourcePath(relativePath), "utf8");
const expectedToolNames = [
  "get_context",
  "get_project",
  "get_plan",
  "get_asset",
  "get_architecture",
  "get_request",
  "get_workLog",
  "get_domain",
  "get_task",
  "get_research",
  "get_wireframe",
  "get_review",
  "get_db",
  "get_erd",
  "get_file",
  "create_project",
  "create_plan",
  "update_plan",
  "create_research",
  "update_research",
  "create_domain",
  "update_domain",
  "create_db",
  "update_db",
  "create_erd",
  "update_erd",
  "create_task",
  "update_task",
  "create_wireframe",
  "update_wireframe",
  "create_asset",
  "update_asset",
  "create_file",
  "update_file",
  "delete_file",
  "create_workLog",
  "create_request",
  "upsert_architecture",
  "update_request",
];

const registeredToolBlock = (serviceSource, toolName) => {
  const start = serviceSource.indexOf(`"${toolName}"`);
  const next = serviceSource.indexOf("server.registerTool", start + toolName.length);

  assert.notEqual(start, -1, `${toolName} 등록이 필요하다`);
  return serviceSource.slice(start, next === -1 ? undefined : next);
};

test("Prisma는 Draft를 제거하고 Project가 Research를 소유한다", () => {
  const schema = readFileSync(join(serverRoot, "prisma", "schema.prisma"), "utf8");
  const project = schema.match(/model Project\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const research = schema.match(/model Research\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";

  assert.doesNotMatch(schema, /model\s+Draft\s*\{/);
  assert.doesNotMatch(project, /^\s*drafts\s+/m);
  assert.match(project, /^\s*research\s+Research\[\]\s*$/m);
  assert.match(research, /^\s*projectId\s+Int\s*$/m);
  assert.match(research, /^\s*project\s+Project\s+@relation\(/m);
  assert.match(research, /^\s*createdAt\s+DateTime\s+@default\(now\(\)\)\s*$/m);
  assert.match(research, /^\s*updatedAt\s+DateTime\s+@updatedAt\s*$/m);
  assert.match(research, /^\s*title\s+String\s*$/m);
  assert.match(research, /^\s*content\s+String\s*$/m);
  assert.match(research, /@@index\(\[projectId\]\)/);
});

test("Project 목록 count는 drafts를 제거하고 research를 포함한다", () => {
  const projects = source("services/projects/projects.service.ts");

  assert.match(projects, /_count:[\s\S]*?research:\s*true/);
  assert.doesNotMatch(projects, /_count:[\s\S]*?drafts:\s*true/);
});

test("App·MCP module과 HTTP route는 Research만 조립하고 Drafts를 제거한다", () => {
  const appModule = source("app.module.ts");
  const mcpModule = source("mcp/mcp.module.ts");

  for (const moduleSource of [appModule, mcpModule]) {
    assert.match(moduleSource, /\bResearchModule\b/);
    assert.doesNotMatch(moduleSource, /\bDraftsModule\b|services\/drafts/);
  }
  assert.equal(existsSync(sourcePath("services/research/research.controller.ts")), true);
  assert.equal(existsSync(sourcePath("services/drafts")), false);
});

test("MCP source는 exact 39 tools와 Research strict schema·annotations·delegation을 제공한다", () => {
  const mcpService = source("mcp/mcp.service.ts");
  const registered = [
    ...mcpService.matchAll(/server\.registerTool\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);

  assert.deepEqual(registered, expectedToolNames);
  assert.equal(registered.length, 39);
  assert.doesNotMatch(mcpService, /get_draft|create_draft|DraftsService|draftsService|\bdrafts\b/);
  assert.match(mcpService, /private readonly researchService:\s*ResearchService/);

  const getResearch = registeredToolBlock(mcpService, "get_research");
  assert.match(getResearch, /projectId:\s*projectIdSchema/);
  assert.match(getResearch, /readOnlyHint:\s*true/);
  assert.match(getResearch, /destructiveHint:\s*false/);
  assert.match(getResearch, /idempotentHint:\s*true/);
  assert.match(getResearch, /openWorldHint:\s*false/);
  assert.match(getResearch, /this\.researchService\.list\s*\(\s*\{\s*projectId\s*\}\s*\)/);

  const createResearch = registeredToolBlock(mcpService, "create_research");
  assert.match(createResearch, /projectId:\s*projectIdSchema/);
  assert.match(createResearch, /title:\s*z\.string\(\)\.min\(1\)/);
  assert.match(createResearch, /content:\s*z\.string\(\)\.min\(1\)/);
  assert.match(createResearch, /readOnlyHint:\s*false/);
  assert.match(createResearch, /destructiveHint:\s*false/);
  assert.match(createResearch, /idempotentHint:\s*false/);
  assert.match(createResearch, /this\.researchService\.create\s*\(\s*input\s*\)/);

  const updateResearch = registeredToolBlock(mcpService, "update_research");
  assert.match(updateResearch, /projectId:\s*projectIdSchema/);
  assert.match(updateResearch, /researchId:\s*z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(updateResearch, /title:\s*z\.string\(\)\.min\(1\)/);
  assert.match(updateResearch, /content:\s*z\.string\(\)\.min\(1\)/);
  assert.match(updateResearch, /readOnlyHint:\s*false/);
  assert.match(updateResearch, /destructiveHint:\s*true/);
  assert.match(updateResearch, /idempotentHint:\s*false/);
  assert.match(updateResearch, /openWorldHint:\s*false/);
  assert.match(updateResearch, /this\.researchService\.update\s*\(\s*input\s*\)/);
});

test("MCP get_project는 Research list와 research 응답만 조립한다", () => {
  const mcpService = source("mcp/mcp.service.ts");
  const getProject = mcpService.match(
    /private async getProjectContext\s*\([\s\S]*?\n\s*}\n\n\s*\/\*\* 도메인 서비스 결과/,
  )?.[0] ?? "";

  assert.match(mcpService, /["']get_project["'][\s\S]*?this\.getProjectContext\(projectId\)/);
  assert.match(getProject, /this\.researchService\.list\s*\(\s*\{\s*projectId\s*\}\s*\)/);
  assert.match(getProject, /\bresearch\b/);
  assert.doesNotMatch(getProject, /\bdrafts\b|draftsService/);
});

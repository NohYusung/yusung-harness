const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const sourcePath = (relativePath) => join(serverRoot, "src", relativePath);
const source = (relativePath) => readFileSync(sourcePath(relativePath), "utf8");

const domains = [
  ["plans", "PlansService", "createVersion"],
  ["assets", "AssetsService", "save"],
  ["drafts", "DraftsService", "save"],
  ["architectures", "ArchitecturesService", "save"],
  ["wireframes", "WireframesService", "save"],
  ["reviews", "ReviewsService", "save"],
  ["designs", "DesignsService", "save"],
];

test("documents 도메인과 MCP 내부 문서 서비스는 두지 않는다", () => {
  assert.equal(
    existsSync(sourcePath("documents")),
    false,
    "src/documents 디렉터리는 없어야 한다",
  );
  assert.equal(
    existsSync(sourcePath("mcp/mcp-documents.service.ts")),
    false,
    "MCP가 문서 도메인 로직을 소유하면 안 된다",
  );
});

test("MCP 도구 등록을 별도 service로 분리하지 않는다", () => {
  assert.equal(
    existsSync(sourcePath("mcp/mcp-tools.service.ts")),
    false,
    "도구 등록과 호출은 McpService가 직접 담당해야 한다",
  );

  const mcpService = source("mcp/mcp.service.ts");
  assert.match(mcpService, /server\.registerTool\s*\(/);
  assert.match(mcpService, /private async execute\s*\(/);
  assert.doesNotMatch(mcpService, /McpToolsService|McpDocumentsService/);
});

test("산출물 저장 로직은 각 도메인 service가 소유한다", () => {
  for (const [domain, serviceName, method] of domains) {
    const serviceFile = `${domain}/${domain}.service.ts`;
    const moduleFile = `${domain}/${domain}.module.ts`;

    assert.equal(
      existsSync(sourcePath(serviceFile)),
      true,
      `${serviceFile}가 존재해야 한다`,
    );
    assert.equal(
      existsSync(sourcePath(moduleFile)),
      true,
      `${moduleFile}가 존재해야 한다`,
    );

    const service = source(serviceFile);
    const moduleSource = source(moduleFile);

    assert.match(service, new RegExp(`export class ${serviceName}`));
    assert.match(service, new RegExp(`async ${method}\\s*\\(`));
    assert.match(
      moduleSource,
      new RegExp(`exports:\\s*\\[[^\\]]*${serviceName}[^\\]]*\\]`, "s"),
      `${serviceName}는 도메인 모듈에서 export해야 한다`,
    );
  }
});

test("McpService는 도구 요청을 각 도메인 service로 위임한다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  for (const [, serviceName] of domains) {
    assert.match(
      mcpService,
      new RegExp(`private readonly \\w+: ${serviceName}`),
      `${serviceName}를 주입받아야 한다`,
    );
  }

  assert.match(mcpService, /this\.plansService\.createVersion\s*\(/);
  assert.match(mcpService, /this\.designsService\.save\s*\(/);

  const documentRoutes = [
    ["DRAFT", "draftsService"],
    ["ARCHITECTURE", "architecturesService"],
    ["WIREFRAME", "wireframesService"],
    ["ASSET", "assetsService"],
    ["REVIEW", "reviewsService"],
  ];

  for (const [kind, field] of documentRoutes) {
    assert.match(
      mcpService,
      new RegExp(`case ["']${kind}["']:[\\s\\S]*?this\\.${field}\\.save\\s*\\(`),
      `${kind} 저장은 ${field}.save로 위임해야 한다`,
    );
  }
});

test("McpModule은 각 도메인 모듈을 조립하고 McpService만 제공한다", () => {
  const moduleSource = source("mcp/mcp.module.ts");
  const moduleNames = [
    "ProjectsModule",
    "TasksModule",
    "PlansModule",
    "AssetsModule",
    "DraftsModule",
    "ArchitecturesModule",
    "WireframesModule",
    "ReviewsModule",
    "DesignsModule",
  ];

  for (const moduleName of moduleNames) {
    assert.match(moduleSource, new RegExp(`\\b${moduleName}\\b`));
  }

  assert.doesNotMatch(moduleSource, /McpToolsService|McpDocumentsService/);
  assert.match(moduleSource, /providers:\s*\[\s*McpService\s*\]/s);
});

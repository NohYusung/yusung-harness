const assert = require("node:assert/strict");
const { existsSync, readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const sourcePath = (relativePath) => join(serverRoot, "src", relativePath);
const source = (relativePath) => readFileSync(sourcePath(relativePath), "utf8");

const registeredToolBlock = (serviceSource, toolName) => {
  const start = serviceSource.indexOf(`"${toolName}"`);
  const nextTool = serviceSource.indexOf("server.registerTool", start + toolName.length);

  assert.notEqual(start, -1, `${toolName} 등록을 찾을 수 있어야 한다`);
  return serviceSource.slice(start, nextTool === -1 ? undefined : nextTool);
};

const domains = [
  ["plans", "PlansService", "create"],
  ["assets", "AssetsService", "create"],
  ["drafts", "DraftsService", "create"],
  ["domains", "DomainsService", "create"],
  ["domains", "DomainsService", "update"],
  ["db", "DbService", "create"],
  ["erd", "ErdService", "create"],
  ["architectures", "ArchitecturesService", "create"],
  ["wireframes", "WireframesService", "create"],
  ["reviews", "ReviewsService", "create"],
  ["designs", "DesignsService", "create"],
  ["files", "FilesService", "create"],
  ["files", "FilesService", "update"],
  ["files", "FilesService", "delete"],
  ["requests", "RequestsService", "create"],
  ["requests", "RequestsService", "update"],
  ["worklogs", "WorklogsService", "create"],
  ["architecture-plans", "ArchitecturePlansService", "create"],
  ["architecture-plans", "ArchitecturePlansService", "update"],
];

const collectControllerFiles = (directory, relativeDirectory = "") => {
  const controllerFiles = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relativePath = join(relativeDirectory, entry.name);
    const absolutePath = join(directory, entry.name);

    if (entry.isDirectory()) {
      controllerFiles.push(...collectControllerFiles(absolutePath, relativePath));
    } else if (entry.name.endsWith(".controller.ts")) {
      const content = readFileSync(absolutePath, "utf8");

      if (/@Controller\s*\(/.test(content)) {
        controllerFiles.push(relativePath);
      }
    }
  }

  return controllerFiles;
};

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

test("Nest HTTP controller는 MCP transport와 읽기 전용 목록 API만 노출한다", () => {
  assert.deepEqual(
    collectControllerFiles(sourcePath(".")).sort(),
    [
      join("mcp", "mcp.controller.ts"),
      join("services", "architecture-plans", "architecture-plans.controller.ts"),
      join("services", "architectures", "architectures.controller.ts"),
      join("services", "assets", "assets.controller.ts"),
      join("services", "designs", "designs.controller.ts"),
      join("services", "db", "db.controller.ts"),
      join("services", "domains", "domains.controller.ts"),
      join("services", "drafts", "drafts.controller.ts"),
      join("services", "erd", "erd.controller.ts"),
      join("services", "plans", "plans.controller.ts"),
      join("services", "projects", "project.controller.ts"),
      join("services", "requests", "requests.controller.ts"),
      join("services", "reviews", "reviews.controller.ts"),
      join("services", "tasks", "tasks.controller.ts"),
      join("services", "wireframes", "wireframes.controller.ts"),
      join("services", "worklogs", "worklogs.controller.ts"),
    ].sort(),
  );
});

test("MCP controller는 모든 HTTP method를 SDK transport에 위임한다", () => {
  const controller = source("mcp/mcp.controller.ts");

  assert.doesNotMatch(controller, /\bAGENT\b/);
  assert.match(controller, /@UseFilters\(\s*JsonExceptionFilter\s*\)/);
  assert.doesNotMatch(controller, /private\s+sendError\s*\(|this\.sendError\s*\(/);
  assert.doesNotMatch(controller, /}\s*catch\s*\(\s*error/);
  assert.match(controller, /@Controller\(\s*["']mcp["']\s*\)/);
  assert.match(
    controller,
    /\/\*\*[\s\S]*?MCP[\s\S]*?요청[\s\S]*?처리[\s\S]*?\*\/[\s\n]*@All\(\)/,
  );
  assert.match(
    controller,
    /@All\(\)[\s\S]*?async\s+handleRequest\s*\([\s\S]*?transport\.handleRequest\(\s*request\s*,\s*response\s*,\s*body\s*\)/,
  );
  assert.match(
    controller,
    /\/\/ 1\. Destructure body, params, query[\s\S]*?\/\/ 2\. Get context[\s\S]*?\/\/ 3\. Get result[\s\S]*?\/\/ 4\. Send response[\s\S]*?transport\.handleRequest/,
  );
  assert.doesNotMatch(controller, /@(Get|Post|Delete)\s*\(/);
  assert.doesNotMatch(controller, /\b(getNotAllowed|deleteNotAllowed)\b/);
  assert.match(
    controller,
    /import\s*\{[^}]*\bAll\b[^}]*\}\s*from\s*["']@nestjs\/common["']/s,
  );
  assert.doesNotMatch(
    controller,
    /import\s*\{[^}]*\b(?:Get|Post|Delete)\b[^}]*\}\s*from\s*["']@nestjs\/common["']/s,
  );
});

test("MCP POST transport는 원격 HTTP client를 host와 origin으로 차단하지 않는다", () => {
  const controller = source("mcp/mcp.controller.ts");

  assert.doesNotMatch(controller, /\bisLocalRequest\b/);
  assert.doesNotMatch(controller, /\blocalHosts\b|request\.hostname|headers\.origin/);
  assert.doesNotMatch(controller, /Only local MCP clients are allowed/);
  assert.doesNotMatch(controller, /this\.sendError\(\s*response\s*,\s*403\b/);
});

test("MCP는 schema context와 project 조회를 노출하고 revision 상태를 소유하지 않는다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  assert.match(mcpService, /export class McpService\s*\{/);
  assert.match(
    mcpService,
    /"get_context"[\s\S]*?readOnlyHint:\s*true[\s\S]*?this\.getSchemaContext\(\)/,
  );
  assert.match(mcpService, /private readonly prismaService:\s*PrismaService/);
  assert.match(mcpService, /this\.prismaService\.\$queryRaw/);
  assert.match(
    mcpService,
    /"get_project"[\s\S]*?projectId:\s*projectIdSchema\.optional\(\)[\s\S]*?readOnlyHint:\s*true/,
  );
  assert.match(
    mcpService,
    /projectId\s*===\s*undefined[\s\S]*?this\.projectsService\.list\(\)[\s\S]*?Promise\.all\s*\(/,
  );
  assert.doesNotMatch(mcpService, /projectsService\.getContext\s*\(/);
  for (const domain of [
    "plans",
    "tasks",
    "drafts",
    "domains",
    "db",
    "erd",
    "architectures",
    "wireframes",
    "assets",
    "designs",
    "reviews",
  ]) {
    assert.match(mcpService, new RegExp(`this\\.${domain}Service\\.list\\s*\\(`));
  }
  assert.doesNotMatch(
    mcpService,
    /ProjectEventsService|project-events|OnModuleDestroy|randomUUID|bootId|revision|waiters|executeMutation|waitForProject|wait_for_project_changes/,
  );
});

test("MCP의 26개 mutation tool은 공통 execute 경계로 결과를 직렬화한다", () => {
  const mcpService = source("mcp/mcp.service.ts");
  const mutationTools = [
    "create_project",
    "create_plan",
    "update_plan",
    "create_draft",
    "create_domain",
    "update_domain",
    "create_db",
    "update_db",
    "create_erd",
    "update_erd",
    "create_task",
    "update_task",
    "create_design",
    "update_design",
    "create_wireframe",
    "update_wireframe",
    "create_asset",
    "update_asset",
    "create_file",
    "update_file",
    "delete_file",
    "create_workLog",
    "create_request",
    "create_architecturePlan",
    "update_architecturePlan",
    "update_request",
  ];

  for (const [index, toolName] of mutationTools.entries()) {
    const start = mcpService.indexOf(`"${toolName}"`);
    const end =
      index === mutationTools.length - 1
        ? mcpService.indexOf("private async execute", start)
        : mcpService.indexOf(`"${mutationTools[index + 1]}"`, start);
    const registration = mcpService.slice(start, end);

    assert.ok(start >= 0, `${toolName} 도구가 등록되어야 한다`);
    assert.match(
      registration,
      /this\.execute\s*\(/,
      `${toolName}은 공통 응답 경계를 사용해야 한다`,
    );
  }

  assert.equal((mcpService.match(/this\.execute\s*\(/g) ?? []).length, 28);
  assert.doesNotMatch(mcpService, /\bAGENT\b/);
  assert.doesNotMatch(mcpService, /executeMutation|publishProjectChange/);
});

test("MCP workflow 생성 도구는 domain service에 저장을 위임한다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  for (const [toolName, service] of [
    ["create_workLog", "worklogsService"],
    ["create_request", "requestsService"],
    ["create_architecturePlan", "architecturePlansService"],
  ]) {
    const tool = registeredToolBlock(mcpService, toolName);

    assert.match(tool, new RegExp(`this\\.${service}\\.create\\s*\\(input\\)`));
  }

  assert.doesNotMatch(
    mcpService,
    /private\s+async\s+(?:createWorkLog|createRequest|createArchitecturePlan)\s*\(/,
  );
  assert.doesNotMatch(
    mcpService,
    /prismaService\.(?:workLog|request|architecturePlan)\.create\s*\(/,
  );
});

test("MCP tool 실패는 JSON text error envelope로 직렬화한다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  assert.match(mcpService, /error instanceof HttpException \? error\.getStatus\(\) : 500/);
  assert.match(mcpService, /isError:\s*true/);
  assert.match(
    mcpService,
    /text:\s*JSON\.stringify\(\{\s*error:\s*\{\s*code,\s*status,\s*message\s*\}\s*\}\)/,
  );
});

test("산출물 저장 로직은 각 도메인 service가 소유한다", () => {
  for (const [domain, serviceName, method] of domains) {
    const serviceFile = `services/${domain}/${domain}.service.ts`;
    const moduleFile = `services/${domain}/${domain}.module.ts`;

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
  const exposedServices = [
    ["ProjectsService", "projectsService", ["list", "create"]],
    ["PlansService", "plansService", ["list", "create"]],
    ["DraftsService", "draftsService", ["list", "create"]],
    ["TasksService", "tasksService", ["list", "create"]],
    ["DomainsService", "domainsService", ["list", "create", "update"]],
    ["DbService", "dbService", ["list", "create", "update"]],
    ["ErdService", "erdService", ["list", "create", "update"]],
    ["ArchitecturesService", "architecturesService", ["list"]],
    ["DesignsService", "designsService", ["list", "create", "update"]],
    ["WireframesService", "wireframesService", ["list", "create", "update"]],
    ["AssetsService", "assetsService", ["list", "create", "update"]],
    ["FilesService", "filesService", ["create", "update", "delete"]],
    ["ReviewsService", "reviewsService", ["list"]],
    ["RequestsService", "requestsService", ["create", "update"]],
    ["WorklogsService", "worklogsService", ["create"]],
    ["ArchitecturePlansService", "architecturePlansService", ["create", "update"]],
  ];

  for (const [serviceName, field, methods] of exposedServices) {
    assert.match(
      mcpService,
      new RegExp(`private readonly ${field}: ${serviceName}`),
      `${serviceName}를 주입받아야 한다`,
    );
    for (const method of methods) {
      assert.match(
        mcpService,
        new RegExp(`this\\.${field}\\.${method}\\s*\\(`),
        `${field}.${method}로 위임해야 한다`,
      );
    }
  }

  assert.doesNotMatch(
    mcpService,
    /plansService\.createVersion\s*\(|(?:drafts|designs|wireframes|assets)Service\.save\s*\(/,
  );
});

test("Project 산출물 생성 도구와 domain service는 taskId 없이 project에 직접 저장한다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  for (const toolName of ["create_wireframe", "create_asset", "create_design"]) {
    const toolBlock = registeredToolBlock(mcpService, toolName);

    assert.match(toolBlock, /projectId:\s*projectIdSchema/);
    assert.doesNotMatch(toolBlock, /\btaskId\b|\bplanId\b/);
  }

  for (const domain of ["assets", "wireframes", "designs"]) {
    const service = source(`services/${domain}/${domain}.service.ts`);

    assert.match(service, /projectId:\s*number/);
    assert.match(service, /ensureProject\s*\(\s*projectId\s*\)/);
    assert.doesNotMatch(service, /\btaskId\b|\bplanId\b|TasksService|ensureTask/);
  }
});

test("Asset, Wireframe, Design MCP 입력은 완전한 HTML이고 service는 공통 validator에 결합되지 않는다", () => {
  const mcpService = source("mcp/mcp.service.ts");

  assert.equal(existsSync(sourcePath("common/html-artifact.ts")), false);

  assert.match(
    mcpService,
    /const htmlSchema\s*=\s*z\s*\.string\(\)[\s\S]*?Complete HTML document/,
  );
  for (const toolName of ["create_wireframe", "create_asset", "create_design"]) {
    assert.match(
      mcpService,
      new RegExp(`"${toolName}"[\\s\\S]*?html:\\s*htmlSchema`),
    );
  }

  for (const domain of ["assets", "wireframes", "designs"]) {
    const service = source(`services/${domain}/${domain}.service.ts`);
    assert.match(service, /html:\s*string/);
    assert.doesNotMatch(service, /assertHtmlArtifact|html-artifact/);
    assert.doesNotMatch(service, /content:\s*string/);
  }
});

test("Asset, Wireframe, Design, Review는 Plan과 Task 없이 Project가 직접 소유한다", () => {
  for (const domain of ["assets", "wireframes", "designs"]) {
    const service = source(`services/${domain}/${domain}.service.ts`);

    assert.match(service, /data:\s*\{[\s\S]*?projectId/);
    assert.doesNotMatch(service, /TasksService|PlansService|ensureTask|ensurePlan/);
    assert.doesNotMatch(service, /\btaskId\b|\bplanId\b/);
  }

  const reviewsService = source("services/reviews/reviews.service.ts");
  assert.match(reviewsService, /ensureProject\s*\(\s*projectId\s*\)/);
  assert.match(reviewsService, /data:\s*\{\s*projectId\s*,\s*title\s*,\s*content\s*\}/);
  assert.doesNotMatch(reviewsService, /PlansService|ensurePlan|\bplanId\b/);

  const designsService = source("services/designs/designs.service.ts");
  assert.match(designsService, /assertRelatedProject\s*\(\s*wireframe\s*,\s*projectId/);
  assert.match(designsService, /assertRelatedProject\s*\(\s*asset\s*,\s*projectId/);
});

test("McpModule은 각 도메인 모듈을 조립하고 McpService만 제공한다", () => {
  const moduleSource = source("mcp/mcp.module.ts");
  const moduleNames = [
    "PrismaModule",
    "ProjectsModule",
    "TasksModule",
    "PlansModule",
    "AssetsModule",
    "FilesModule",
    "DraftsModule",
    "DomainsModule",
    "ArchitecturesModule",
    "WireframesModule",
    "DesignsModule",
    "ReviewsModule",
    "RequestsModule",
    "WorklogsModule",
    "ArchitecturePlansModule",
  ];

  for (const moduleName of moduleNames) {
    assert.match(moduleSource, new RegExp(`\\b${moduleName}\\b`));
  }

  assert.doesNotMatch(moduleSource, /McpToolsService|McpDocumentsService/);
  assert.match(moduleSource, /providers:\s*\[\s*McpService\s*\]/s);
});

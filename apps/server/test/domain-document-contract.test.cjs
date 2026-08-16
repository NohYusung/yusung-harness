const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const sourcePath = (relativePath) => join(serverRoot, "src", relativePath);
const source = (relativePath) => {
  const path = sourcePath(relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};

test("Domain service는 Markdown 페이지를 transaction에서 생성·수정하며 계층 경계를 검증한다", () => {
  assert.equal(existsSync(sourcePath("services/domains/domain-erd.ts")), false);
  assert.equal(
    existsSync(sourcePath("services/architectures/architecture-erd.ts")),
    false,
  );

  const service = source("services/domains/domains.service.ts");

  assert.doesNotMatch(
    service,
    /\bAGENT\b|domainErdSchema|parseDomainErd|diagram:\s*unknown|async\s+save\s*\(/,
  );
  assert.match(service, /this\.prisma\.domain\.findMany\s*\(/);
  assert.match(
    service,
    /import\s*\{[\s\S]*?BadRequestException[\s\S]*?NotFoundException[\s\S]*?\}\s*from\s*["']@nestjs\/common["']/,
  );
  assert.match(
    service,
    /async\s+create\s*\([\s\S]*?parentId\?:\s*number\s*\|\s*null[\s\S]*?ensureProject\(projectId\)[\s\S]*?this\.prisma\.\$transaction\s*\([\s\S]*?transaction\.domain\.create\s*\(/,
  );
  assert.match(
    service,
    /async\s+update\s*\([\s\S]*?domainId:\s*number[\s\S]*?parentId\?:\s*number\s*\|\s*null[\s\S]*?ensureProject\(projectId\)[\s\S]*?transaction\.domain\.findUnique\s*\(\{\s*where:\s*\{\s*id:\s*domainId\s*\}/,
  );
  assert.match(service, /throw\s+new\s+NotFoundException\s*\(/);
  assert.match(service, /throw\s+new\s+ConflictException\s*\(/);
  assert.match(
    service,
    /\w+\.projectId\s*!==\s*projectId[\s\S]*?throw\s+new\s+BadRequestException\s*\(/,
  );
  assert.match(
    service,
    /transaction\.domain\.update\s*\(\{[\s\S]*?where:\s*\{\s*id:\s*domainId\s*\}[\s\S]*?parentId:\s*nextParentId[\s\S]*?title:\s*normalizedTitle[\s\S]*?content/,
  );
  assert.match(service, /isDomainErdPayload\s*\(/);
  assert.match(service, /Domain hierarchy is already cyclic/);
});

test("Domain 목록 API는 Markdown 페이지라는 책임과 읽기 전용 HTTP 경계를 드러낸다", () => {
  const controller = source("services/domains/domains.controller.ts");
  const service = source("services/domains/domains.service.ts");

  assert.doesNotMatch(controller, /\bAGENT\b|Domain ERD/);
  assert.match(controller, /계층형 비즈니스 Domain Markdown 페이지 목록 조회/);
  assert.match(service, /프로젝트의 Markdown 비즈니스 Domain 페이지를 최근 수정순으로 조회/);
  assert.match(service, /this\.prisma\.domain\.findMany\s*\(/);
  assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\s*\(/);
});

test("MCP는 optional nullable parentId와 Domain 조회·생성·수정을 service에 위임한다", () => {
  const mcp = source("mcp/mcp.service.ts");

  assert.match(mcp, /private readonly domainsService:\s*DomainsService/);
  assert.match(mcp, /this\.domainsService\.list\s*\(/);
  assert.match(
    mcp,
    /registerTool\(\s*["']create_domain["'][\s\S]*?this\.domainsService\.create\s*\(\s*input\s*\)/,
  );
  assert.match(
    mcp,
    /registerTool\(\s*["']update_domain["'][\s\S]*?this\.domainsService\.update\s*\(\s*input\s*\)/,
  );
  assert.match(mcp, /parentId:\s*domainParentIdSchema/);
  assert.match(mcp, /domainParentIdSchema[\s\S]*?\.nullable\(\)[\s\S]*?\.optional\(\)/);
  assert.doesNotMatch(
    mcp,
    /domainErdSchema|domainsService\.save\s*\(|["']DOMAIN["']|save_document/,
  );
});

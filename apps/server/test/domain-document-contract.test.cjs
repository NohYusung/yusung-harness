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

test("Domain은 별도 schema와 서버 쓰기 경로 없이 분석 문서 조회만 제공한다", () => {
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
  assert.doesNotMatch(
    service,
    /BadRequestException|NotFoundException|this\.prisma\.domain\.(?:findUnique|create|update)/,
  );
});

test("Domain 목록 API는 분석 문서라는 책임과 읽기 전용 HTTP 경계를 드러낸다", () => {
  const controller = source("services/domains/domains.controller.ts");
  const service = source("services/domains/domains.service.ts");

  assert.doesNotMatch(controller, /\bAGENT\b|Domain ERD/);
  assert.match(controller, /프로젝트 Domain 분석 문서 목록 조회/);
  assert.match(service, /프로젝트의 Domain 분석 문서를 최근 수정순으로 조회/);
  assert.match(service, /this\.prisma\.domain\.findMany\s*\(/);
  assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\s*\(/);
});

test("MCP는 Domain 목록만 조립하고 문서 해석·저장 책임을 소유하지 않는다", () => {
  const mcp = source("mcp/mcp.service.ts");

  assert.match(mcp, /private readonly domainsService:\s*DomainsService/);
  assert.match(mcp, /this\.domainsService\.list\s*\(/);
  assert.doesNotMatch(mcp, /domainErdSchema|domainsService\.save\s*\(/);
  assert.doesNotMatch(mcp, /["']DOMAIN["']|save_document|create_domain/);
});

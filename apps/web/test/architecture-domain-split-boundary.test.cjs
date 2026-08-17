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

test("web DTO·Zod는 PLAN과 PRODUCTION을 한 Architecture relation으로 통합한다", () => {
  const types = source("types/dashboard.ts");
  const validation = source("lib/validations/dashboard.ts");

  assert.match(types, /interface\s+ArtifactCounts\b[\s\S]*?domains:\s*number/);
  assert.match(types, /export\s+interface\s+Domain\s+extends\s+ArtifactDocument/);
  assert.match(types, /interface\s+Domain[\s\S]*?parentId:\s*number\s*\|\s*null/);
  assert.match(types, /export\s+type\s+ArchitectureType\s*=\s*["']PLAN["']\s*\|\s*["']PRODUCTION["']/);
  assert.match(types, /export\s+interface\s+Architecture\s+extends\s+ArtifactDocument/);
  assert.match(types, /interface\s+Architecture[\s\S]*?type:\s*ArchitectureType/);
  assert.match(types, /interface\s+Architecture[\s\S]*?html:\s*string/);
  assert.match(types, /interface\s+ProjectContext\b[\s\S]*?domains:\s*Domain\[\]/);
  assert.match(types, /interface\s+ProjectContext\b[\s\S]*?architectures:\s*Architecture\[\]/);
  assert.doesNotMatch(types, /\bArchitecturePlan\b|architecturePlans:/);
  assert.match(validation, /domainSchema[\s\S]*?parentId:\s*z\.number\(\)[\s\S]*?nullable\(\)/);
  assert.match(validation, /domains:\s*z\.array\s*\(\s*domainSchema\s*\)/);
  assert.match(validation, /architectureTypeSchema\s*=\s*z\.enum\(\s*\[\s*["']PLAN["']\s*,\s*["']PRODUCTION["']/);
  assert.match(validation, /architectureSchema[\s\S]*?type:\s*architectureTypeSchema[\s\S]*?html:\s*z\.string\(\)/);
  assert.match(validation, /architectures:\s*z\.array\s*\(\s*architectureSchema\s*\)/);
  assert.doesNotMatch(validation, /architecturePlanSchema|architecturePlanListResponseSchema|architecturePlans:/);
});

test("Domain ERD parser는 제거되고 deployment Architecture parser만 유지된다", () => {
  const architecture = source("lib/deployment-architecture.ts");

  assert.equal(existsSync(join(webRoot, "src", "lib/domain-erd.ts")), false);
  assert.match(architecture, /export\s+const\s+deploymentArchitectureSchema\b/);
  assert.match(architecture, /kind:\s*z\.literal\s*\(\s*["']deployment-architecture["']/);
  assert.match(architecture, /environments:\s*z\s*\.array\s*\(/);
  assert.match(architecture, /nodes:\s*z\s*\.array\s*\(/);
  assert.match(architecture, /connections:\s*z\s*\.array\s*\(/);
  assert.match(architecture, /export\s+function\s+parseDeploymentArchitecture\b/);
  assert.match(architecture, /export\s+function\s+getLatestDeploymentArchitecture\b/);
});

test("Domain은 통합 계층 Workbench를, Architecture는 배포 graph를 사용한다", () => {
  const workbench = source("components/features/dashboard/ArtifactWorkbench.tsx");
  const architectureWorkspace = source(
    "components/features/dashboard/ArchitectureWorkspace.tsx",
  );

  assert.equal(
    existsSync(
      join(
        webRoot,
        "src",
        "components/features/dashboard/DomainWorkspace.tsx",
      ),
    ),
    false,
  );
  assert.match(workbench, /buildDomainTree/);
  assert.match(workbench, /role=\{isDomainView\s*\?\s*["']tree["']/);
  assert.match(workbench, /aria-level=\{domainRow\s*\?/);
  assert.match(workbench, /<MarkdownContent\s+content=\{getContent\(selectedEntry\)\}/);
  assert.match(architectureWorkspace, /getLatestDeploymentArchitecture/);
  assert.match(architectureWorkspace, /architectures:\s*Architecture\[\]/);
  assert.match(architectureWorkspace, /Legacy|legacy/);
  assert.doesNotMatch(architectureWorkspace, /getLatestDomainErd|parseDomainErd/);
});

test("ArtifactWorkbench는 선택한 PRODUCTION Architecture 한 건만 graph workspace에 전달한다", () => {
  const workbench = source("components/features/dashboard/ArtifactWorkbench.tsx");

  assert.match(
    workbench,
    /import\s*\{[\s\S]*?\bArchitectureWorkspace\b[\s\S]*?\}\s*from\s*["'][^"']*ArchitectureWorkspace["']/,
  );
  assert.match(
    workbench,
    /const\s+selectedArchitecture\s*=\s*selectedEntry\?\.relation\s*===\s*["']architectures["']/,
  );
  assert.match(
    workbench,
    /<ArchitectureWorkspace\b[\s\S]*?architectures=\{\s*\[\s*selectedProductionArchitecture\s*\]\s*\}/,
  );
  assert.doesNotMatch(
    workbench,
    /<ArchitectureWorkspace\b[\s\S]*?architectures=\{\s*context\.architectures\s*\}/,
  );
});

test("통합 Workbench는 Domain과 Architecture record type을 독립적으로 조립한다", () => {
  const workbench = source(
    "components/features/dashboard/ArtifactWorkbench.tsx",
  );
  const dashboard = source("components/features/dashboard/Dashboard.tsx");
  const page = source("app/projects/[projectId]/page.tsx");

  assert.match(
    workbench,
    /relationOrder\s*:[^=]*=\s*\[[^\]]*["']domains["'][^\]]*["']architectures["']/s,
  );
  assert.match(workbench, /domains:\s*context\.domains/);
  assert.match(workbench, /architectures:\s*context\.architectures/);
  assert.doesNotMatch(workbench, /architecturePlans:\s*context\.architecturePlans/);
  assert.match(workbench, /domains:\s*\{[\s\S]*?label:\s*["']Domain["']/);
  assert.match(
    workbench,
    /architectures:\s*\{[\s\S]*?label:\s*["']Architecture["']/,
  );
  assert.match(dashboard, /<ArtifactWorkbench\b/);
  assert.match(page, /workspaceRelations\s*=\s*\[[^\]]*["']domains["'][^\]]*["']architectures["']/s);
});

test("Architecture workspace는 중앙 Plan Current 탭만으로 typed record를 분리한다", () => {
  const workbench = source("components/features/dashboard/ArtifactWorkbench.tsx");

  assert.match(workbench, /aria-label=["']Architecture views["']/);
  assert.match(workbench, />\s*Plan\s*</);
  assert.match(workbench, />\s*Current\s*</);
  assert.match(workbench, /architecture\.type\s*===\s*["']PLAN["']/);
  assert.match(workbench, /architecture\.type\s*===\s*["']PRODUCTION["']/);
  assert.doesNotMatch(workbench, /relation:\s*["']architecturePlans["']|activeRelation\s*===\s*["']architecturePlans["']/);
});

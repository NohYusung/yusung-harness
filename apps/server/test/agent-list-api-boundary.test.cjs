const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const source = (relativePath) => {
  const path = join(serverRoot, "src", relativePath);

  assert.equal(existsSync(path), true, `${relativePath}가 존재해야 한다`);
  return readFileSync(path, "utf8");
};

const sourcePath = (relativePath) => join(serverRoot, "src", relativePath);

const domains = [
  {
    resource: "plans",
    model: "plan",
    className: "Plans",
    orderField: "version",
  },
  {
    resource: "drafts",
    model: "draft",
    className: "Drafts",
    orderField: "updatedAt",
  },
  {
    resource: "domains",
    model: "domain",
    className: "Domains",
    orderField: "updatedAt",
  },
  {
    resource: "db",
    model: "dB",
    className: "Db",
    orderField: "updatedAt",
  },
  {
    resource: "erd",
    model: "eRD",
    className: "Erd",
    orderField: "updatedAt",
  },
  {
    resource: "architectures",
    model: "architecture",
    className: "Architectures",
    orderField: "updatedAt",
  },
  {
    resource: "architecture-plans",
    model: "architecturePlan",
    className: "ArchitecturePlans",
    orderField: "updatedAt",
  },
  {
    resource: "tasks",
    model: "task",
    className: "Tasks",
    orderField: "updatedAt",
  },
  {
    resource: "wireframes",
    model: "wireframe",
    className: "Wireframes",
    orderField: "updatedAt",
  },
  {
    resource: "assets",
    model: "asset",
    className: "Assets",
    orderField: "updatedAt",
  },
  {
    resource: "reviews",
    model: "review",
    className: "Reviews",
    orderField: "updatedAt",
  },
  {
    resource: "requests",
    model: "request",
    className: "Requests",
    orderField: "updatedAt",
  },
  {
    resource: "worklogs",
    model: "workLog",
    className: "Worklogs",
    orderField: "updatedAt",
  },
];

const controllers = [
  {
    resource: "projects",
    controllerFile: "project.controller.ts",
    controllerClass: "ProjectController",
    route: "projects",
  },
  ...domains.map(({ resource, className }) => ({
    resource,
    serviceProperty: resource.replace(/-([a-z])/g, (_, letter) =>
      letter.toUpperCase(),
    ),
    controllerFile: `${resource}.controller.ts`,
    controllerClass: `${className}Controller`,
    route:
      resource === "tasks"
        ? "tasks/:projectId/:planId"
        : `${resource}/:projectId`,
  })),
];

const methodBody = (content, methodName) => {
  const signature = new RegExp(`(?:async\\s+)?${methodName}\\s*\\(`);
  const signatureMatch = signature.exec(content);

  assert.ok(signatureMatch, `${methodName} method가 존재해야 한다`);

  const parametersStart = content.indexOf("(", signatureMatch.index);
  let parametersEnd = -1;
  let parenthesesDepth = 0;

  for (let index = parametersStart; index < content.length; index += 1) {
    if (content[index] === "(") parenthesesDepth += 1;
    if (content[index] === ")") parenthesesDepth -= 1;

    if (parenthesesDepth === 0) {
      parametersEnd = index;
      break;
    }
  }

  assert.notEqual(parametersEnd, -1, `${methodName} method 파라미터가 완결되어야 한다`);

  const blockStart = content.indexOf("{", parametersEnd);
  assert.notEqual(blockStart, -1, `${methodName} method body가 존재해야 한다`);

  let depth = 0;
  for (let index = blockStart; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth -= 1;

    if (depth === 0) {
      return content.slice(blockStart + 1, index);
    }
  }

  assert.fail(`${methodName} method body가 완결되어야 한다`);
};

const objectBodyAt = (content, blockStart, label) => {
  assert.notEqual(blockStart, -1, `${label} object가 존재해야 한다`);

  let depth = 0;
  for (let index = blockStart; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth -= 1;

    if (depth === 0) {
      return content.slice(blockStart + 1, index);
    }
  }

  assert.fail(`${label} object가 완결되어야 한다`);
};

const objectBodyAfter = (content, pattern, label) => {
  const match = pattern.exec(content);

  assert.ok(match, `${label}가 존재해야 한다`);
  return objectBodyAt(content, content.indexOf("{", match.index + match[0].length), label);
};

const topLevelPropertyIndex = (content, property) => {
  let depth = 0;

  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "{") depth += 1;
    if (content[index] === "}") depth -= 1;
    if (depth !== 0 || !/[A-Za-z_$]/.test(content[index])) continue;

    const name = content.slice(index).match(/^[A-Za-z_$][\w$]*/)?.[0];
    if (!name) continue;

    let colonIndex = index + name.length;
    while (/\s/.test(content[colonIndex])) colonIndex += 1;

    if (name === property && content[colonIndex] === ":") {
      return colonIndex;
    }

    index += name.length - 1;
  }

  return -1;
};

const topLevelObjectBody = (content, property) => {
  const propertyIndex = topLevelPropertyIndex(content, property);

  assert.notEqual(propertyIndex, -1, `${property} relation이 존재해야 한다`);
  return objectBodyAt(
    content,
    content.indexOf("{", propertyIndex),
    `${property} relation`,
  );
};

test("프로젝트와 산출물 HTTP controller는 읽기 전용 목록 API를 노출한다", () => {
  for (const {
    resource,
    controllerFile,
    controllerClass,
    route,
    serviceProperty,
  } of controllers) {
    const controller = source(`services/${resource}/${controllerFile}`);

    assert.doesNotMatch(controller, /\bAGENT\b/);
    assert.match(
      controller,
      new RegExp(`@Controller\\(\\s*["']${route}["']\\s*\\)`),
      `${resource} controller route가 일치해야 한다`,
    );
    assert.match(controller, new RegExp(`export class ${controllerClass}`));
    assert.match(controller, /\/\*\*[\s\S]*?목록 조회[\s\S]*?\*\/[\s\n]*@Get\(\)/);
    assert.doesNotMatch(controller, /@(Post|Put|Patch|Delete)\s*\(/);
    assert.match(controller, /\/\/ 1\. Destructure body, params, query/);
    assert.match(controller, /\/\/ 2\. Get context/);
    assert.match(controller, /\/\/ 3\. Get result/);
    assert.match(controller, /\/\/ 4\. Send response/);
    assert.match(controller, /return\s+\{\s*data\s*\}/);

    if (resource === "projects") {
      assert.match(controller, /this\.projectsService\.list\s*\(\s*\)/);
    } else {
      assert.match(
        controller,
        /@Param\(\s*["']projectId["']\s*,\s*ParseIntPipe\s*\)\s*projectId:\s*number/,
      );
      if (resource === "tasks") {
        assert.match(
          controller,
          /@Param\(\s*["']planId["']\s*,\s*ParseIntPipe\s*\)\s*planId:\s*number/,
        );
        assert.match(
          controller,
          /this\.tasksService\.list\(\s*\{\s*projectId\s*,\s*planId\s*\}\s*\)/,
        );
      } else if (resource !== "plans") {
        assert.match(
          controller,
          new RegExp(`this\\.${serviceProperty}Service\\.list\\(\\s*\\{\\s*projectId\\s*\\}\\s*\\)`),
        );
      }
    }
  }
});

test("프로젝트 aggregate context 상세 API와 service 책임은 제거한다", () => {
  const controller = source("services/projects/project.controller.ts");
  const service = source("services/projects/projects.service.ts");

  assert.doesNotMatch(controller, /@Get\(\s*["']:projectId["']\s*\)|\bgetContext\s*\(/);
  assert.doesNotMatch(service, /\bAGENT\b|\bgetContext\s*\(/);
});

test("resource module과 AppModule은 목록 controller를 등록한다", () => {
  for (const { resource, controllerClass } of controllers) {
    const moduleSource = source(`services/${resource}/${resource}.module.ts`);

    assert.match(moduleSource, new RegExp(`\\b${controllerClass}\\b`));
    assert.match(
      moduleSource,
      new RegExp(`controllers:\\s*\\[[^\\]]*${controllerClass}[^\\]]*\\]`, "s"),
    );
  }

  const appModule = source("app.module.ts");
  for (const moduleName of [
    "ProjectsModule",
    "PlansModule",
    "DraftsModule",
    "TasksModule",
    "DomainsModule",
    "DbModule",
    "ErdModule",
    "ArchitecturesModule",
    "ArchitecturePlansModule",
    "WireframesModule",
    "AssetsModule",
    "ReviewsModule",
    "RequestsModule",
    "WorklogsModule",
  ]) {
    assert.match(appModule, new RegExp(`\\b${moduleName}\\b`));
  }
});

test("Requests와 Worklogs module은 목록 controller와 service 의존성을 공개한다", () => {
  for (const { resource, className } of domains.filter(({ resource }) =>
    ["requests", "worklogs"].includes(resource),
  )) {
    const moduleSource = source(`services/${resource}/${resource}.module.ts`);

    assert.doesNotMatch(moduleSource, /\bAGENT\b/);
    assert.match(moduleSource, /imports:\s*\[\s*PrismaModule\s*,\s*ProjectsModule\s*\]/);
    assert.match(
      moduleSource,
      new RegExp(`controllers:\\s*\\[\\s*${className}Controller\\s*\\]`),
    );
    assert.match(
      moduleSource,
      new RegExp(`providers:\\s*\\[\\s*${className}Service\\s*\\]`),
    );
    assert.match(
      moduleSource,
      new RegExp(`exports:\\s*\\[\\s*${className}Service\\s*\\]`),
    );
  }
});

test("MCP get_project는 projectId가 있으면 10종 domain list service를 병렬 조립한다", () => {
  const mcpService = source("mcp/mcp.service.ts");
  const domainServices = [
    "plans",
    "tasks",
    "drafts",
    "domains",
    "db",
    "erd",
    "architectures",
    "wireframes",
    "assets",
    "reviews",
  ];

  assert.match(mcpService, /"get_project"/);
  assert.match(mcpService, /readOnlyHint:\s*true/);
  assert.doesNotMatch(mcpService, /projectsService\.getContext\s*\(/);
  assert.match(mcpService, /Promise\.all\s*\(/);
  for (const service of domainServices) {
    assert.match(
      mcpService,
      new RegExp(`this\\.${service}Service\\.list\\(\\s*\\{\\s*projectId\\s*\\}`),
      `${service}Service.list를 호출해야 한다`,
    );
  }
});

test("Plan 목록과 controller는 versionOrder 없이 최근 수정순 계약을 사용한다", () => {
  const service = source("services/plans/plans.service.ts");
  const controller = source("services/plans/plans.controller.ts");
  const list = methodBody(service, "list");
  const findManyArgs = objectBodyAfter(
    list,
    /this\.prisma\.plan\.findMany\s*\(/,
    "Plan findMany args",
  );
  const controllerList = methodBody(controller, "list");

  assert.doesNotMatch(service, /\bAGENT\b/);
  assert.match(
    service,
    /async\s+list\s*\(\s*\{\s*projectId\s*\}\s*:\s*\{\s*projectId:\s*number\s*\}\s*\)/,
  );
  assert.match(
    topLevelObjectBody(findManyArgs, "orderBy"),
    /updatedAt:\s*["']desc["']/,
  );
  assert.match(
    controllerList,
    /this\.plansService\.list\s*\(\s*\{\s*projectId\s*\}\s*\)/,
  );
  assert.doesNotMatch(service, /\bversion\b|\.\.\.options/);
  assert.doesNotMatch(controller, /versionOrder|PlanVersionOrder|@Query/);
});

test("일반 목록 service는 project 소유권을 검증하고 각 table을 결정적 순서로 조회한다", () => {
  for (const { resource, model, orderField } of domains.filter(
    ({ resource }) => resource !== "plans" && resource !== "tasks",
  )) {
    const service = source(`services/${resource}/${resource}.service.ts`);
    const body = methodBody(service, "list");
    const ensureIndex = body.search(
      /await\s+this\.projectsService\.ensureProject\s*\(\s*projectId\s*\)/,
    );
    const queryIndex = body.search(
      new RegExp(`this\\.prisma\\.${model}\\.findMany\\s*\\(`),
    );

    assert.doesNotMatch(service, /\bAGENT\b/);
    assert.match(
      service,
      /async\s+list\s*\(\s*\{\s*projectId\s*\}\s*:\s*\{\s*projectId:\s*number\s*\}\s*\)/,
      `${resource} list는 projectId를 인라인 구조 분해해야 한다`,
    );
    assert.ok(ensureIndex >= 0, `${resource} list는 project 존재를 검증해야 한다`);
    assert.ok(queryIndex > ensureIndex, `${resource} list는 project 검증 후 조회해야 한다`);
    assert.match(body, /where:\s*\{\s*projectId\s*\}/);
    assert.match(
      body,
      new RegExp(`orderBy:\\s*\\{\\s*${orderField}:\\s*["']desc["']\\s*\\}`),
      `${resource} list의 정렬 기준이 일관되어야 한다`,
    );
  }
});

test("HTML 산출물 공통 validator는 삭제하고 저장 service에서 참조하지 않는다", () => {
  assert.equal(existsSync(sourcePath("common/html-artifact.ts")), false);

  for (const resource of ["wireframes", "assets"]) {
    const service = source(`services/${resource}/${resource}.service.ts`);

    assert.doesNotMatch(service, /html-artifact|assertHtmlArtifact/);
  }
});

test("Plan은 Task만 포함하고 Task 목록은 제거된 산출물 relation을 포함하지 않는다", () => {
  const planList = methodBody(source("services/plans/plans.service.ts"), "list");
  const planInclude = objectBodyAfter(planList, /include\s*:/, "Plan include");

  assert.notEqual(topLevelPropertyIndex(planInclude, "tasks"), -1);
  for (const relation of ["assets", "wireframes", "reviews"]) {
    assert.equal(
      topLevelPropertyIndex(planInclude, relation),
      -1,
      `제거된 Plan.${relation} relation을 include하면 안 된다`,
    );
  }

  const planTaskOptions = topLevelObjectBody(planInclude, "tasks");
  assert.match(
    planTaskOptions,
    /orderBy:\s*\{\s*createdAt:\s*["']asc["']\s*\}/,
  );
  assert.doesNotMatch(planTaskOptions, /\binclude\s*:/);

  const taskList = methodBody(source("services/tasks/tasks.service.ts"), "list");
  assert.doesNotMatch(taskList, /\binclude\s*:/);
  for (const relation of ["assets", "wireframes"]) {
    assert.doesNotMatch(taskList, new RegExp(`\\b${relation}\\s*:`));
  }
});

test("Plan 생성은 version 할당과 task 중첩 없이 기본 PENDING row를 만든다", () => {
  const service = source("services/plans/plans.service.ts");

  assert.match(service, /async\s+create\s*\(/);
  const create = methodBody(service, "create");
  const planCreate = objectBodyAfter(
    create,
    /this\.prisma\.plan\.create\s*\(/,
    "Plan create args",
  );

  assert.equal(topLevelPropertyIndex(planCreate, "include"), -1);
  assert.doesNotMatch(planCreate, /\bversion\s*:/);
  assert.doesNotMatch(planCreate, /tasks\s*:\s*\{[\s\S]*?create\s*:/);
  assert.doesNotMatch(service, /findFirst|createVersion|\bversion\b/);
});

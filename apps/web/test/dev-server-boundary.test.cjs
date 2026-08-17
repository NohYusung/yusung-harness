const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { createRequire } = require("node:module");
const { dirname, join } = require("node:path");
const test = require("node:test");

const configPath = join(__dirname, "..", "next.config.ts");
const configDirectory = dirname(configPath);
const configRequire = createRequire(configPath);
const configSource = readFileSync(configPath, "utf8");
const packageJson = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8"),
);
const typescript = configRequire("typescript");

/**
 * TypeScript Next.js 설정을 메모리에서 CommonJS로 변환해 실제 default export를 읽는다.
 */
function loadNextConfig() {
  const transpiledConfig = typescript.transpileModule(configSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: typescript.ModuleKind.CommonJS,
      target: typescript.ScriptTarget.ES2022,
    },
    fileName: configPath,
  });
  const configModule = { exports: {} };
  const executeConfig = new Function(
    "exports",
    "require",
    "module",
    "__filename",
    "__dirname",
    transpiledConfig.outputText,
  );

  executeConfig(
    configModule.exports,
    configRequire,
    configModule,
    configPath,
    configDirectory,
  );

  return configModule.exports.default ?? configModule.exports;
}

/**
 * pnpm symlink를 안정적으로 해석하도록 Webpack과 Watchpack 1초 폴링을 고정한다.
 */
test("개발 서버는 Webpack과 Watchpack 1초 폴링을 사용하고 Turbopack root를 재정의하지 않는다", () => {
  const nextConfig = loadNextConfig();
  const devScript = packageJson.scripts?.dev;

  assert.equal(typeof devScript, "string", "web dev script가 존재해야 한다");
  assert.match(
    devScript,
    /(?:^|\s)WATCHPACK_POLLING=1000(?:\s|$)/,
    "web dev script는 Watchpack의 폴링 간격을 정확히 1초로 지정해야 한다",
  );
  assert.match(
    devScript,
    /(?:^|\s)--webpack(?:\s|$)/,
    "web dev script는 Next.js Webpack 모드를 명시해야 한다",
  );
  assert.equal(
    nextConfig.watchOptions?.pollIntervalMs,
    1000,
    "Next.js config는 1초 간격으로 파일 변경을 폴링해야 한다",
  );
  assert.equal(
    nextConfig.turbopack?.root,
    undefined,
    "Next.js config는 Turbopack root를 재정의하면 안 된다",
  );
  assert.doesNotMatch(
    configSource,
    /\bturbopack\s*:\s*\{[\s\S]*?\broot\s*:/,
    "Next.js config source에도 Turbopack root override가 없어야 한다",
  );
});

const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const packageJson = JSON.parse(
  readFileSync(join(serverRoot, "package.json"), "utf8"),
);
const scriptPath = join(serverRoot, "scripts", "prepare-sqlite.mjs");

test("DB migration scripts는 prepare와 Architecture·Research preflight 후 migrate를 실행한다", () => {
  for (const [scriptName, migrateCommand] of [
    ["predev", "prisma migrate deploy"],
    ["prestart", "prisma migrate deploy"],
    ["prisma:migrate", "prisma migrate dev"],
  ]) {
    const command = packageJson.scripts[scriptName];
    const prepare = command.indexOf("node scripts/prepare-sqlite.mjs");
    const preflight = command.indexOf(
      "node scripts/preflight-architecture-consolidation.mjs",
    );
    const researchPreflight = command.indexOf(
      "node scripts/preflight-research-migration.mjs",
    );
    const migrate = command.indexOf(migrateCommand);

    assert.match(command, /node scripts\/prepare-sqlite\.mjs/);
    assert.match(
      command,
      /node scripts\/preflight-architecture-consolidation\.mjs/,
    );
    assert.match(command, /node scripts\/preflight-research-migration\.mjs/);
    assert.ok(prepare < preflight, `${scriptName}는 prepare 후 preflight해야 한다`);
    assert.ok(preflight < researchPreflight, `${scriptName}는 Architecture 후 Research preflight해야 한다`);
    assert.ok(researchPreflight < migrate, `${scriptName}는 preflight 후 migrate해야 한다`);
    assert.match(
      command,
      new RegExp(
        `node scripts/prepare-sqlite\\.mjs && node scripts/preflight-architecture-consolidation\\.mjs && node scripts/preflight-research-migration\\.mjs && ${migrateCommand.replaceAll(" ", "\\s+")}`,
      ),
      `${scriptName}는 preflight 실패 시 migrate deploy를 중단해야 한다`,
    );
  }
});

test("prepare script는 기본 URL, schema 기준 상대경로, absolute file URL을 지원한다", () => {
  assert.equal(existsSync(scriptPath), true, "prepare-sqlite.mjs가 존재해야 한다");

  const source = existsSync(scriptPath) ? readFileSync(scriptPath, "utf8") : "";
  assert.match(source, /file:\.\/harness-board\.db/);
  assert.match(source, /fileURLToPath/);
  assert.match(source, /mkdir\s*\(/);
  assert.match(source, /open\s*\(/);
});

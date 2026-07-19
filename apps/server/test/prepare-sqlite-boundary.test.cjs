const assert = require("node:assert/strict");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

const serverRoot = join(__dirname, "..");
const packageJson = JSON.parse(
  readFileSync(join(serverRoot, "package.json"), "utf8"),
);
const scriptPath = join(serverRoot, "scripts", "prepare-sqlite.mjs");

test("predev와 prestart는 migrate deploy 전에 SQLite 파일을 준비한다", () => {
  for (const scriptName of ["predev", "prestart"]) {
    const command = packageJson.scripts[scriptName];

    assert.match(command, /node scripts\/prepare-sqlite\.mjs/);
    assert.ok(
      command.indexOf("node scripts/prepare-sqlite.mjs") <
        command.indexOf("prisma migrate deploy"),
      `${scriptName}는 migrate deploy 전에 SQLite를 준비해야 한다`,
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

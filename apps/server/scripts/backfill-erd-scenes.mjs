import "dotenv/config";

import Database from "better-sqlite3";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveSqlitePath } from "./prepare-sqlite.mjs";
import { backfillErdScenes } from "./lib/backfill-erd-scenes.mjs";

const defaultDatabaseUrl = "file:./harness-board.db";
const schemaDirectory = fileURLToPath(new URL("../prisma/", import.meta.url));

/** DATABASE_URL이 가리키는 SQLite 파일에서 legacy ERD scene backfill을 실행한다. */
export const runErdSceneBackfill = ({
  databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl,
} = {}) => {
  const databasePath = resolveSqlitePath(databaseUrl, schemaDirectory);
  const database = new Database(databasePath);

  try {
    database.pragma("foreign_keys = ON");
    return backfillErdScenes(database);
  } finally {
    database.close();
  }
};

const executedScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

/** 직접 실행된 경우에만 DB를 열어 predev/prestart backfill을 수행한다. */
if (executedScript === import.meta.url) {
  const result = runErdSceneBackfill();
  console.log(`ERD scene backfill complete: ${result.converted} converted`);
}

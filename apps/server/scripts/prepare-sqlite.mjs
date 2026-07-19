import "dotenv/config";

import { mkdir, open } from "node:fs/promises";
import { dirname, isAbsolute, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultDatabaseUrl = "file:./harness-board.db";
const defaultSchemaDirectory = fileURLToPath(
  new URL("../prisma/", import.meta.url),
);

export function resolveSqlitePath(databaseUrl, schemaDirectory) {
  if (!databaseUrl.startsWith("file:")) {
    throw new TypeError("DATABASE_URL must be a SQLite file: URL");
  }

  const filePath = databaseUrl.slice("file:".length);

  if (!filePath) {
    throw new TypeError("DATABASE_URL must include a SQLite file path");
  }

  if (filePath.startsWith("/") || isAbsolute(filePath)) {
    return fileURLToPath(new URL(databaseUrl));
  }

  const relativePath = decodeURIComponent(filePath.split(/[?#]/, 1)[0]);

  if (!relativePath) {
    throw new TypeError("DATABASE_URL must include a SQLite file path");
  }

  return resolve(schemaDirectory, relativePath);
}

export async function prepareSqliteDatabase({
  databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl,
  schemaDirectory = defaultSchemaDirectory,
} = {}) {
  const databasePath = resolveSqlitePath(databaseUrl, schemaDirectory);

  await mkdir(dirname(databasePath), { recursive: true });

  const databaseFile = await open(databasePath, "a");
  await databaseFile.close();

  return databasePath;
}

const executedScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

if (executedScript === import.meta.url) {
  const databasePath = await prepareSqliteDatabase();
  console.log(`SQLite database ready: ${databasePath}`);
}

import "dotenv/config";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { defineConfig } from "prisma/config";

const prismaDirectory = resolve(__dirname, "prisma");

/** Prisma CLI가 사용할 필수 database URL을 검증하고 정규화한다. */
const requireDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required and must be a non-empty string.",
    );
  }

  /** 상대 SQLite URL을 schema 디렉터리 기준의 절대 file URL로 통일한다. */
  if (databaseUrl.startsWith("file:./")) {
    const relativeUrl = databaseUrl.slice("file:".length);
    const suffixIndex = relativeUrl.search(/[?#]/u);
    const relativePath =
      suffixIndex < 0 ? relativeUrl : relativeUrl.slice(0, suffixIndex);
    const suffix = suffixIndex < 0 ? "" : relativeUrl.slice(suffixIndex);
    const absoluteUrl = pathToFileURL(
      resolve(prismaDirectory, decodeURIComponent(relativePath)),
    ).href;

    return `${absoluteUrl}${suffix}`;
  }

  return databaseUrl;
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: requireDatabaseUrl(),
  },
});

import "dotenv/config";
import { defineConfig } from "prisma/config";

/** Prisma CLI가 사용할 필수 database URL을 검증하고 정규화한다. */
const requireDatabaseUrl = (): string => {
  const databaseUrl = process.env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required and must be a non-empty string.",
    );
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

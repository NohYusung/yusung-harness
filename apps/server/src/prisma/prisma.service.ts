import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@prisma/client";
import { resolve } from "node:path";

function resolveDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL?.trim();

  if (!configuredUrl) {
    throw new Error("DATABASE_URL is required to start the server");
  }

  if (!configuredUrl.startsWith("file:./")) {
    return configuredUrl;
  }

  const relativePath = configuredUrl.slice("file:./".length);
  return `file:${resolve(__dirname, "../../prisma", relativePath)}`;
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaBetterSqlite3({ url: resolveDatabaseUrl() });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

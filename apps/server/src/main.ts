import "dotenv/config";
import "reflect-metadata";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const port = Number.parseInt(process.env.PORT ?? "4000", 10);

  app.enableShutdownHooks();
  await app.listen(port, "127.0.0.1");

  Logger.log(`MCP server listening on http://127.0.0.1:${port}/mcp`, "Bootstrap");
}

bootstrap().catch((error: unknown) => {
  Logger.error(error, "Failed to start server", "Bootstrap");
  process.exitCode = 1;
});

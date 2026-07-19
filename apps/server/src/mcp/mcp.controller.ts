import { Body, Controller, Delete, Get, Logger, Post, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { McpService, type McpConnection } from "./mcp.service";

@Controller("mcp")
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  @Post()
  async handleRequest(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    if (!this.isLocalRequest(request)) {
      this.sendError(response, 403, -32000, "Only local MCP clients are allowed");
      return;
    }

    let closed = false;
    let server: McpConnection["server"] | undefined;
    const close = (): void => {
      if (closed || !server) return;
      closed = true;
      void server.close().catch((error: unknown) =>
        this.logger.error("Failed to close MCP connection", error),
      );
    };

    try {
      const connection = await this.mcpService.createConnection();
      server = connection.server;
      response.once("finish", close);
      response.once("close", close);

      const { transport } = connection;
      await transport.handleRequest(request, response, body);
    } catch (error: unknown) {
      this.logger.error("Failed to handle MCP request", error);
      if (!response.headersSent) {
        this.sendError(response, 500, -32603, "Internal server error");
      }
      close();
    }
  }

  @Get()
  getNotAllowed(@Res() response: Response): void {
    this.sendError(response, 405, -32000, "Method not allowed");
  }

  @Delete()
  deleteNotAllowed(@Res() response: Response): void {
    this.sendError(response, 405, -32000, "Method not allowed");
  }

  private isLocalRequest(request: Request): boolean {
    const host = request.hostname;
    const localHosts = new Set(["127.0.0.1", "localhost", "::1"]);

    if (!localHosts.has(host)) {
      return false;
    }

    const origin = request.headers.origin;
    if (!origin) {
      return true;
    }

    try {
      return localHosts.has(new URL(origin).hostname);
    } catch {
      return false;
    }
  }

  private sendError(
    response: Response,
    status: number,
    code: number,
    message: string,
  ): void {
    response.status(status).json({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    });
  }
}

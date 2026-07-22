import {
  All,
  Body,
  Controller,
  Logger,
  Req,
  Res,
  UseFilters,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { JsonExceptionFilter } from "../libs/json-exception.filter";
import { McpService, type McpConnection } from "./mcp.service";

@Controller("mcp")
@UseFilters(JsonExceptionFilter)
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpService: McpService) {}

  /**
   * 원격 MCP Streamable HTTP 요청 처리
   */
  @All()
  async handleRequest(
    @Req() request: Request,
    @Res() response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    let closed = false;
    let server: McpConnection["server"] | undefined;

    /** HTTP 응답 수명주기에 맞춰 MCP server connection을 한 번만 닫는다. */
    const close = (): void => {
      if (closed || !server) return;
      closed = true;
      void server
        .close()
        .catch((error: unknown) =>
          this.logger.error("Failed to close MCP connection", error),
        );
    };

    const connection = await this.mcpService.createConnection();
    server = connection.server;
    response.once("finish", close);
    response.once("close", close);

    const { transport } = connection;

    // 4. Send response
    await transport.handleRequest(request, response, body);
  }
}

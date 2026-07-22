import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";

/** 처리되지 않은 MCP transport 오류를 JSON-RPC 오류 응답으로 변환한다. */
@Catch()
export class JsonExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(JsonExceptionFilter.name);

  /** 전송 가능한 HTTP 응답에만 표준 JSON-RPC 내부 오류를 기록한다. */
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    this.logger.error("Failed to handle MCP request", exception);

    /** 이미 시작된 streaming 응답은 필터에서 다시 작성하지 않는다. */
    if (response.headersSent) {
      return;
    }

    response.status(500).json({
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
  }
}

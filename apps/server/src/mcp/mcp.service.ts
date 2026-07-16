import { Injectable } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

@Injectable()
export class McpService {
  //mcp서버는 stateless, 요청마다 인스턴스 생성
  createServer(): McpServer {
    const server = new McpServer(
      {
        name: "yusung-harness-dec",
        version: "0.1.0",
      },
      {
        instructions: [
          "이 mcp 는 작업내역을 tracking하고 산출물을 관리하는 문서관리형 mcp 이다",
        ].join(""), //배열의 모든 원소를 하나의 긴 문자열로 병합
      },
    );

    this.registerTools(server);

    return server;
  }
}

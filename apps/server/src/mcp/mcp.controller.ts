import { Controller, Logger } from "@nestjs/common";
import { McpService } from "./mcp.service";

@Controller("mcp")
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(private readonly mcpServce: McpService) {}
}

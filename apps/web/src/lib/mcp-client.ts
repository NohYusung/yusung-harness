import "server-only";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { z, type ZodType } from "zod";
import { getHarnessMcpUrl } from "@/lib/harness-mcp-url";

const mcpErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    status: z.number().int(),
  }),
});

interface CallHarnessToolOptions {
  signal?: AbortSignal;
  timeout?: number;
}

/** MCP tool이 구조화해 반환한 도메인 오류. */
export class HarnessMcpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message);
    this.name = "HarnessMcpError";
  }
}

/** 하나의 MCP 연결에서 여러 tool을 호출할 수 있는 서버 전용 client. */
export interface HarnessMcpClient {
  callTool<T>(
    name: string,
    args: Record<string, unknown>,
    schema: ZodType<T>,
    options?: CallHarnessToolOptions,
  ): Promise<T>;
  close(): Promise<void>;
}

/** stateless Streamable HTTP MCP endpoint에 연결한다. */
export async function createHarnessMcpClient(): Promise<HarnessMcpClient> {
  const client = new Client({
    name: "yusung-harness-web",
    version: "0.1.0",
  });
  const transport = new StreamableHTTPClientTransport(getHarnessMcpUrl());

  try {
    await client.connect(transport);
  } catch (error: unknown) {
    await transport.close().catch(() => undefined);
    throw error;
  }

  return {
    async callTool<T>(
      name: string,
      args: Record<string, unknown>,
      schema: ZodType<T>,
      options: CallHarnessToolOptions = {},
    ): Promise<T> {
      const result = await client.callTool(
        { name, arguments: args },
        undefined,
        options,
      );

      if ("toolResult" in result) {
        throw new HarnessMcpError(
          `Unexpected task result from MCP tool ${name}`,
          502,
          "UNEXPECTED_TASK_RESULT",
        );
      }

      const text = result.content.find((block) => block.type === "text")?.text;
      if (!text) {
        throw new HarnessMcpError(
          `MCP tool ${name} returned no JSON text content`,
          502,
          "INVALID_TOOL_RESULT",
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text);
      } catch {
        throw new HarnessMcpError(
          `MCP tool ${name} returned invalid JSON`,
          502,
          "INVALID_TOOL_RESULT",
        );
      }

      if (result.isError) {
        const parsedError = mcpErrorSchema.safeParse(payload);
        if (parsedError.success) {
          throw new HarnessMcpError(
            parsedError.data.error.message,
            parsedError.data.error.status,
            parsedError.data.error.code,
          );
        }

        throw new HarnessMcpError(
          `MCP tool ${name} failed`,
          502,
          "MCP_TOOL_FAILED",
        );
      }

      return schema.parse(payload);
    },

    close(): Promise<void> {
      return client.close();
    },
  };
}

/** 단일 MCP tool 호출에 필요한 연결 생명주기를 관리한다. */
export async function callHarnessTool<T>(
  name: string,
  args: Record<string, unknown>,
  schema: ZodType<T>,
  options?: CallHarnessToolOptions,
): Promise<T> {
  const client = await createHarnessMcpClient();

  try {
    return await client.callTool(name, args, schema, options);
  } finally {
    await client.close();
  }
}

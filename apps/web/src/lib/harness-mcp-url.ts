import "server-only";

/** 서버 런타임에서 사용할 Harness MCP endpoint를 반환한다. */
export function getHarnessMcpUrl(): URL {
  return new URL(
    process.env.HARNESS_MCP_URL ?? "http://127.0.0.1:4000/mcp",
  );
}

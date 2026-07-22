import { describe, expect, it } from "vitest";
import { parseDeploymentArchitecture } from "@/lib/deployment-architecture";

const validDeployment = {
  kind: "deployment-architecture",
  schemaVersion: 1,
  name: "Harness production",
  generatedAt: "2026-07-21T09:00:00+09:00",
  sourceRevision: "abc123",
  environments: [
    { id: "browser", name: "Browser", kind: "client" },
    {
      id: "production",
      name: "Production",
      kind: "cloud",
      provider: "Vercel",
      region: "icn1",
    },
  ],
  nodes: [
    {
      id: "web",
      name: "Next.js Web",
      kind: "client",
      environmentId: "browser",
      runtime: "Node.js 24",
    },
    {
      id: "api",
      name: "Nest API",
      kind: "service",
      environmentId: "production",
      runtime: "Node.js 24",
      description: "MCP and dashboard API",
    },
  ],
  connections: [
    {
      id: "web-api",
      sourceNodeId: "web",
      targetNodeId: "api",
      label: "Dashboard API",
      protocol: "HTTPS",
    },
  ],
} as const;

describe("parseDeploymentArchitecture", () => {
  it("raw JSON과 markdown fence의 deployment graph를 파싱한다", () => {
    expect(parseDeploymentArchitecture(JSON.stringify(validDeployment))).toEqual(
      validDeployment,
    );
    expect(
      parseDeploymentArchitecture(
        `배포 구조\n\`\`\`json\n${JSON.stringify(validDeployment)}\n\`\`\``,
      ),
    ).toEqual(validDeployment);
  });

  it("다른 kind·unknown field·깨진 cross reference를 거부한다", () => {
    for (const snapshot of [
      { ...validDeployment, kind: "domain-erd" },
      { ...validDeployment, unexpected: true },
      {
        ...validDeployment,
        nodes: [
          { ...validDeployment.nodes[0], environmentId: "missing" },
          validDeployment.nodes[1],
        ],
      },
      {
        ...validDeployment,
        connections: [
          { ...validDeployment.connections[0], targetNodeId: "missing" },
        ],
      },
    ]) {
      expect(() => parseDeploymentArchitecture(JSON.stringify(snapshot))).toThrow();
    }
  });

  it("self connection·중복 directed pair·중복 ID/name을 거부한다", () => {
    for (const snapshot of [
      {
        ...validDeployment,
        connections: [
          { ...validDeployment.connections[0], targetNodeId: "web" },
        ],
      },
      {
        ...validDeployment,
        connections: [
          validDeployment.connections[0],
          { ...validDeployment.connections[0], id: "web-api-copy" },
        ],
      },
      {
        ...validDeployment,
        nodes: [
          validDeployment.nodes[0],
          { ...validDeployment.nodes[1], name: validDeployment.nodes[0].name },
        ],
      },
    ]) {
      expect(() => parseDeploymentArchitecture(JSON.stringify(snapshot))).toThrow();
    }
  });
});

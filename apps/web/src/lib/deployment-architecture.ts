import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(120);
const optionalShortTextSchema = z.string().trim().min(1).max(200).optional();
const optionalTextSchema = z.string().trim().min(1).max(2_000).optional();
const environmentKindSchema = z.enum([
  "client",
  "local",
  "cloud",
  "edge",
  "external",
]);
const nodeKindSchema = z.enum([
  "client",
  "gateway",
  "service",
  "worker",
  "database",
  "cache",
  "queue",
  "storage",
  "external",
]);
const MAX_DEPLOYMENT_ENVIRONMENTS = 50;
const MAX_DEPLOYMENT_NODES = 100;
const MAX_DEPLOYMENT_CONNECTIONS = 1_000;

const deploymentEnvironmentSchema = z
  .object({
    id: identifierSchema,
    name: identifierSchema,
    kind: environmentKindSchema,
    provider: optionalShortTextSchema,
    region: optionalShortTextSchema,
  })
  .strict();

const deploymentNodeSchema = z
  .object({
    id: identifierSchema,
    name: identifierSchema,
    kind: nodeKindSchema,
    environmentId: identifierSchema.optional(),
    runtime: optionalShortTextSchema,
    provider: optionalShortTextSchema,
    region: optionalShortTextSchema,
    description: optionalTextSchema,
  })
  .strict();

const deploymentConnectionSchema = z
  .object({
    id: identifierSchema,
    sourceNodeId: identifierSchema,
    targetNodeId: identifierSchema,
    label: optionalTextSchema,
    protocol: optionalShortTextSchema,
  })
  .strict();

/** 배포 환경, 실행 노드, 통신 경로를 표현하는 Architecture graph 계약. */
export const deploymentArchitectureSchema = z
  .object({
    kind: z.literal("deployment-architecture"),
    schemaVersion: z.literal(1),
    name: z.string().trim().min(1).max(200),
    generatedAt: z.iso.datetime({ offset: true }).optional(),
    sourceRevision: z.string().trim().min(1).max(200).optional(),
    environments: z
      .array(deploymentEnvironmentSchema)
      .max(MAX_DEPLOYMENT_ENVIRONMENTS),
    nodes: z.array(deploymentNodeSchema).min(1).max(MAX_DEPLOYMENT_NODES),
    connections: z
      .array(deploymentConnectionSchema)
      .max(MAX_DEPLOYMENT_CONNECTIONS),
  })
  .strict()
  .superRefine((diagram, context) => {
    const environmentIds = new Set<string>();
    const environmentNames = new Set<string>();

    diagram.environments.forEach((environment, environmentIndex) => {
      if (environmentIds.has(environment.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate environment id: ${environment.id}`,
          path: ["environments", environmentIndex, "id"],
        });
      }
      environmentIds.add(environment.id);

      if (environmentNames.has(environment.name)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate environment name: ${environment.name}`,
          path: ["environments", environmentIndex, "name"],
        });
      }
      environmentNames.add(environment.name);
    });

    const nodeIds = new Set<string>();
    const nodeNames = new Set<string>();

    diagram.nodes.forEach((node, nodeIndex) => {
      if (nodeIds.has(node.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate node id: ${node.id}`,
          path: ["nodes", nodeIndex, "id"],
        });
      }
      nodeIds.add(node.id);

      if (nodeNames.has(node.name)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate node name: ${node.name}`,
          path: ["nodes", nodeIndex, "name"],
        });
      }
      nodeNames.add(node.name);

      if (node.environmentId && !environmentIds.has(node.environmentId)) {
        context.addIssue({
          code: "custom",
          message: `Unknown environment: ${node.environmentId}`,
          path: ["nodes", nodeIndex, "environmentId"],
        });
      }
    });

    const connectionIds = new Set<string>();
    const connectionEndpoints = new Set<string>();

    diagram.connections.forEach((connection, connectionIndex) => {
      if (connectionIds.has(connection.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate connection id: ${connection.id}`,
          path: ["connections", connectionIndex, "id"],
        });
      }
      connectionIds.add(connection.id);

      for (const endpoint of ["sourceNodeId", "targetNodeId"] as const) {
        if (!nodeIds.has(connection[endpoint])) {
          context.addIssue({
            code: "custom",
            message: `Unknown ${endpoint}: ${connection[endpoint]}`,
            path: ["connections", connectionIndex, endpoint],
          });
        }
      }

      if (connection.sourceNodeId === connection.targetNodeId) {
        context.addIssue({
          code: "custom",
          message: "A node cannot connect to itself (self connection)",
          path: ["connections", connectionIndex, "targetNodeId"],
        });
      }

      const endpointKey = `${connection.sourceNodeId}->${connection.targetNodeId}`;
      if (connectionEndpoints.has(endpointKey)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate directed connection: ${endpointKey}`,
          path: ["connections", connectionIndex],
        });
      }
      connectionEndpoints.add(endpointKey);
    });
  });

/** 런타임 검증을 통과한 배포 Architecture graph. */
export type DeploymentArchitecture = z.infer<
  typeof deploymentArchitectureSchema
>;
/** 배포 graph의 실행 node. */
export type DeploymentNode = DeploymentArchitecture["nodes"][number];

/** JSON 원문 또는 markdown JSON fence에서 snapshot JSON을 추출한다. */
function extractJson(content: string): string {
  const trimmed = content.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedJson = trimmed.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  if (!fencedJson) {
    throw new Error(
      "Architecture content does not contain a deployment JSON snapshot",
    );
  }

  return fencedJson;
}

/** 저장된 content를 검증된 배포 Architecture graph로 파싱한다. */
export function parseDeploymentArchitecture(
  content: string,
): DeploymentArchitecture {
  return deploymentArchitectureSchema.parse(JSON.parse(extractJson(content)));
}

/** 파싱 실패를 legacy record로 취급할 수 있도록 null로 반환한다. */
export function safeParseDeploymentArchitecture(
  content: string,
): DeploymentArchitecture | null {
  try {
    return parseDeploymentArchitecture(content);
  } catch {
    return null;
  }
}

/** 최신 valid deployment graph와 파싱되지 않은 legacy record를 분리한다. */
export function getLatestDeploymentArchitecture<
  RecordType extends { content: string; updatedAt: string },
>(records: RecordType[]): {
  legacyRecords: RecordType[];
  record: RecordType;
  snapshot: DeploymentArchitecture;
} | null {
  const parsedRecords = records.map((record) => ({
    record,
    snapshot: safeParseDeploymentArchitecture(record.content),
  }));
  const validRecords = parsedRecords
    .filter(
      (
        item,
      ): item is {
        record: RecordType;
        snapshot: DeploymentArchitecture;
      } => item.snapshot !== null,
    )
    .sort(
      (left, right) =>
        Date.parse(right.record.updatedAt) - Date.parse(left.record.updatedAt),
    );
  const legacyRecords = parsedRecords
    .filter((item) => item.snapshot === null)
    .map((item) => item.record);
  const latest = validRecords[0];

  return latest ? { ...latest, legacyRecords } : null;
}

import { z } from "zod/v4";

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
    const environments = new Map(
      diagram.environments.map((environment) => [environment.id, environment]),
    );
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

    const nodes = new Map(
      diagram.nodes.map((node) => [node.id, node]),
    );
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

      if (node.environmentId && !environments.has(node.environmentId)) {
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
        if (!nodes.has(connection[endpoint])) {
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

/** 알 수 없는 입력을 검증하고 정규화된 배포 Architecture로 좁힌다. */
export function parseDeploymentArchitecture(
  input: unknown,
): DeploymentArchitecture {
  return deploymentArchitectureSchema.parse(input);
}

/** 검증된 배포 Architecture를 DB content 컬럼용 canonical JSON으로 직렬화한다. */
export function serializeDeploymentArchitecture(input: unknown): string {
  return JSON.stringify(parseDeploymentArchitecture(input));
}

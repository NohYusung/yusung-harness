import "dotenv/config";

import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  copyFile,
  mkdir,
  unlink,
} from "node:fs/promises";
import { basename, extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { z } from "zod/v4";
import { resolveSqlitePath } from "./prepare-sqlite.mjs";

const defaultDatabaseUrl = "file:./harness-board.db";
const defaultSchemaDirectory = fileURLToPath(
  new URL("../prisma/", import.meta.url),
);
const defaultBackupDirectory = "/private/tmp";

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

/** Runtime schema와 동일하게 legacy PRODUCTION graph 전체를 검증한다. */
const deploymentArchitectureSchema = z
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
    const environmentIds = new Set();
    const environmentNames = new Set();

    /** Environment ID·name 중복을 차단한다. */
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

    const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
    const nodeIds = new Set();
    const nodeNames = new Set();

    /** Node ID·name 중복과 Environment 참조를 검증한다. */
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

    const connectionIds = new Set();
    const connectionEndpoints = new Set();

    /** Connection ID·endpoint 중복과 Node 참조, self-loop를 검증한다. */
    diagram.connections.forEach((connection, connectionIndex) => {
      if (connectionIds.has(connection.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate connection id: ${connection.id}`,
          path: ["connections", connectionIndex, "id"],
        });
      }
      connectionIds.add(connection.id);

      for (const endpoint of ["sourceNodeId", "targetNodeId"]) {
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

/** SQLite table 존재 여부와 Architecture type column을 기준으로 DB 상태를 판별한다. */
function inspectConsolidationState(database) {
  const tables = new Set(
    database
      .prepare(
        `SELECT "name" FROM sqlite_master
         WHERE "type" = 'table'
           AND "name" IN ('Architecture', 'ArchitecturePlan')`,
      )
      .all()
      .map(({ name }) => name),
  );
  const hasArchitecture = tables.has("Architecture");
  const hasArchitecturePlan = tables.has("ArchitecturePlan");

  if (!hasArchitecture && !hasArchitecturePlan) {
    return "fresh";
  }

  const architectureColumns = hasArchitecture
    ? new Set(
        database
          .prepare('PRAGMA table_info("Architecture")')
          .all()
          .map(({ name }) => name),
      )
    : new Set();
  const hasArchitectureType = architectureColumns.has("type");

  if (hasArchitecture && !hasArchitecturePlan && hasArchitectureType) {
    return "already-consolidated";
  }

  if (hasArchitecture && hasArchitecturePlan && !hasArchitectureType) {
    return "legacy";
  }

  throw new Error(
    "Unsupported partial Architecture schema; refusing consolidation preflight",
  );
}

/** DB 파일의 integrity와 foreign key 위반 건수를 조회하고 위반 시 실패한다. */
function inspectDatabaseHealth(database, label) {
  const integrityCheck = database.pragma("integrity_check", { simple: true });
  const foreignKeyViolationCount = database.pragma("foreign_key_check").length;

  if (integrityCheck !== "ok") {
    throw new Error(`${label} integrity_check failed: ${integrityCheck}`);
  }

  if (foreignKeyViolationCount > 0) {
    throw new Error(
      `${label} foreign_key_check failed: ${foreignKeyViolationCount} violation(s)`,
    );
  }

  return { integrityCheck, foreignKeyViolationCount };
}

/** 통합 전후 비교에 사용할 legacy Architecture row count를 조회한다. */
function readLegacyCounts(database) {
  return {
    architectures: database
      .prepare('SELECT COUNT(*) AS "count" FROM "Architecture"')
      .get().count,
    architecturePlans: database
      .prepare('SELECT COUNT(*) AS "count" FROM "ArchitecturePlan"')
      .get().count,
  };
}

/** 모든 legacy Architecture content를 runtime deployment schema로 검증한다. */
function validateLegacyArchitectures(database) {
  const rows = database
    .prepare('SELECT "id", "title", "content" FROM "Architecture" ORDER BY "id"')
    .all();

  /** 첫 invalid row에서 migration을 차단할 수 있는 구체적인 오류를 만든다. */
  for (const row of rows) {
    let content;
    try {
      content = JSON.parse(row.content);
    } catch (error) {
      throw new Error(
        `Architecture ${row.id} (${row.title}) contains invalid JSON`,
        { cause: error },
      );
    }

    const result = deploymentArchitectureSchema.safeParse(content);
    if (!result.success) {
      const issues = result.error.issues
        .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
        .join("; ");
      throw new Error(
        `Architecture ${row.id} (${row.title}) is not a valid deployment graph: ${issues}`,
      );
    }
  }
}

/** 파일 전체의 SHA-256 digest를 계산한다. */
async function sha256File(filePath) {
  const hash = createHash("sha256");

  await new Promise((resolvePromise, rejectPromise) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", rejectPromise);
    stream.on("end", resolvePromise);
  });

  return hash.digest("hex");
}

/** backup 복사본을 별도 파일로 복원해 health와 row count를 다시 검증한다. */
async function rehearseRestore({ backupPath, backupDirectory, expectedCounts }) {
  const rehearsalPath = resolve(
    backupDirectory,
    `.architecture-consolidation-restore-${randomUUID()}.db`,
  );

  try {
    await copyFile(backupPath, rehearsalPath);
    const restored = new Database(rehearsalPath, {
      readonly: true,
      fileMustExist: true,
    });

    try {
      const health = inspectDatabaseHealth(restored, "Restore rehearsal");
      const counts = readLegacyCounts(restored);

      if (
        counts.architectures !== expectedCounts.architectures ||
        counts.architecturePlans !== expectedCounts.architecturePlans
      ) {
        throw new Error("Restore rehearsal row counts do not match source");
      }

      return { ok: true, ...health, counts };
    } finally {
      restored.close();
    }
  } finally {
    await unlink(rehearsalPath).catch(() => undefined);
  }
}

/** Legacy Architecture 통합 전에 backup·검증·복원 evidence를 생성한다. */
export async function runArchitectureConsolidationPreflight({
  databaseUrl = process.env.DATABASE_URL ?? defaultDatabaseUrl,
  schemaDirectory = defaultSchemaDirectory,
  backupDirectory = defaultBackupDirectory,
  logger = console,
} = {}) {
  const databasePath = resolveSqlitePath(databaseUrl, schemaDirectory);
  const database = new Database(databasePath, { fileMustExist: true });

  try {
    database.pragma("foreign_keys = ON");
    const state = inspectConsolidationState(database);

    if (state !== "legacy") {
      const result = { action: "noop", state };
      logger.log(
        `Architecture consolidation preflight: ${JSON.stringify(result)}`,
      );
      return result;
    }

    const health = inspectDatabaseHealth(database, "Source database");
    const counts = readLegacyCounts(database);
    validateLegacyArchitectures(database);

    const resolvedBackupDirectory = resolve(backupDirectory);
    await mkdir(resolvedBackupDirectory, { recursive: true });
    const extension = extname(databasePath) || ".db";
    const databaseName = basename(databasePath, extname(databasePath));
    const backupPath = resolve(
      resolvedBackupDirectory,
      `${databaseName}-architecture-consolidation-${new Date()
        .toISOString()
        .replace(/[^0-9TZ]/g, "")}-${randomUUID()}${extension}`,
    );

    await database.backup(backupPath);
    const sha256 = await sha256File(backupPath);
    const restoreRehearsal = await rehearseRestore({
      backupPath,
      backupDirectory: resolvedBackupDirectory,
      expectedCounts: counts,
    });
    const result = {
      action: "ready",
      databasePath,
      backupPath,
      sha256,
      counts,
      ...health,
      restoreRehearsal,
    };

    logger.log(
      `Architecture consolidation preflight: ${JSON.stringify(result)}`,
    );
    return result;
  } finally {
    database.close();
  }
}

const executedScript = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;

/** 직접 실행된 경우 migration 전 preflight를 수행한다. */
if (executedScript === import.meta.url) {
  await runArchitectureConsolidationPreflight();
}

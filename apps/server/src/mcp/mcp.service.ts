import {
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { PrismaService } from "../prisma/prisma.service";
import { deploymentArchitectureSchema } from "../services/architectures/deployment-architecture";
import { ArchitecturesService } from "../services/architectures/architectures.service";
import { AssetsService } from "../services/assets/assets.service";
import { DbService } from "../services/db/db.service";
import { DesignsService } from "../services/designs/designs.service";
import { DomainsService } from "../services/domains/domains.service";
import { DraftsService } from "../services/drafts/drafts.service";
import { dineugErdDocumentSchema } from "../services/erd/dineug-document";
import { ErdService } from "../services/erd/erd.service";
import { FilesService } from "../services/files/files.service";
import { PlansService } from "../services/plans/plans.service";
import { ProjectsService } from "../services/projects/projects.service";
import { RequestsService } from "../services/requests/requests.service";
import { ReviewsService } from "../services/reviews/reviews.service";
import { TasksService } from "../services/tasks/tasks.service";
import { WireframesService } from "../services/wireframes/wireframes.service";
import { WorklogsService } from "../services/worklogs/worklogs.service";

const projectIdSchema = z.number().int().positive().describe("Project ID");
const planIdSchema = z.number().int().positive().describe("Plan ID");
const taskIdSchema = z.number().int().positive().describe("Task ID");
const domainIdSchema = z.number().int().positive().describe("Domain ID");
const domainParentIdSchema = domainIdSchema
  .nullable()
  .optional()
  .describe("Optional parent Domain ID; null selects a root Domain");
const dbIdSchema = z.number().int().positive().describe("DB document ID");
const erdIdSchema = z.number().int().positive().describe("ERD document ID");
const fileIdSchema = z.number().int().positive().describe("File ID");
const requestIdSchema = z.number().int().positive().describe("Request ID");
const wireframeIdSchema = z.number().int().positive().describe("Wireframe ID");
const wireframeVersionSchema = z
  .number()
  .int()
  .positive()
  .describe("Wireframe version set");
const assetIdSchema = z.number().int().positive().describe("Asset ID");
const designIdSchema = z.number().int().positive().describe("Design ID");
const designVersionSchema = z
  .number()
  .int()
  .positive()
  .describe("Explicit Design version");
const wireframeIndexSchema = z
  .string()
  .trim()
  .max(255)
  .regex(/^[1-9]\d*(?:\.[1-9]\d*)*$/)
  .describe("Hierarchical Wireframe index path");
const htmlSchema = z
  .string()
  .min(1)
  .describe("Complete HTML document including doctype, html, head, and body");

/** PLAN Architecture가 저장하는 완전한 HTML 문서 계약. */
const architecturePlanHtmlSchema = htmlSchema
  .regex(
    /^\s*<!doctype html>/i,
    "Architecture PLAN HTML must include a doctype",
  )
  .regex(
    /<html(?:\s[^>]*)?>[\s\S]*<\/html>\s*$/i,
    "Architecture PLAN HTML must include an html root",
  )
  .regex(
    /<head(?:\s[^>]*)?>[\s\S]*<\/head>/i,
    "Architecture PLAN HTML must include a head",
  )
  .regex(
    /<body(?:\s[^>]*)?>[\s\S]*<\/body>/i,
    "Architecture PLAN HTML must include a body",
  );

/** PLAN 문서와 PRODUCTION graph를 구분하는 Architecture upsert 입력 계약. */
const architectureUpsertSchema = z.discriminatedUnion("type", [
  z
    .object({
      projectId: projectIdSchema,
      type: z.literal("PLAN"),
      title: z.string().trim().min(1),
      content: z.string().min(1),
      html: architecturePlanHtmlSchema,
    })
    .strict(),
  z
    .object({
      projectId: projectIdSchema,
      type: z.literal("PRODUCTION"),
      title: z.string().trim().min(1),
      diagram: deploymentArchitectureSchema,
    })
    .strict(),
]);

type SqliteInteger = bigint | number;
type SqliteSchemaObjectType = "index" | "table" | "trigger" | "view";

interface SqliteSchemaObjectRow {
  type: SqliteSchemaObjectType;
  name: string;
  tableName: string;
  sql: string | null;
}

interface SqliteColumnRow {
  cid: SqliteInteger;
  name: string;
  type: string;
  notNull: SqliteInteger;
  defaultValue: string | null;
  primaryKeyOrdinal: SqliteInteger;
  hidden: SqliteInteger;
}

interface SqliteIndexRow {
  name: string;
  isUnique: SqliteInteger;
  origin: string;
  partial: SqliteInteger;
}

interface SqliteIndexColumnRow {
  sequence: SqliteInteger;
  columnId: SqliteInteger;
  name: string | null;
  descending: SqliteInteger;
  collation: string | null;
  key: SqliteInteger;
}

interface SqliteForeignKeyRow {
  id: SqliteInteger;
  sequence: SqliteInteger;
  referencedTable: string;
  fromColumn: string;
  toColumn: string | null;
  onUpdate: string;
  onDelete: string;
  match: string;
}

const toNumber = (value: SqliteInteger): number => Number(value);
const toBoolean = (value: SqliteInteger): boolean => toNumber(value) === 1;

/** HTTP 요청 단위로 생성한 MCP server와 stateless transport 조합. */
export interface McpConnection {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly plansService: PlansService,
    private readonly tasksService: TasksService,
    private readonly draftsService: DraftsService,
    private readonly domainsService: DomainsService,
    private readonly architecturesService: ArchitecturesService,
    private readonly wireframesService: WireframesService,
    private readonly assetsService: AssetsService,
    private readonly designsService: DesignsService,
    private readonly dbService: DbService,
    private readonly erdService: ErdService,
    private readonly reviewsService: ReviewsService,
    private readonly requestsService: RequestsService,
    private readonly worklogsService: WorklogsService,
    private readonly filesService: FilesService,
  ) {}

  /** 41개 도구를 등록한 stateless MCP 연결을 생성한다. */
  async createConnection(): Promise<McpConnection> {
    const server = new McpServer(
      {
        name: "yusung-harness-doc",
        version: "0.1.0",
      },
      {
        instructions: ["yusung-harness 전용 MCP 서버"].join("\n"),
      },
    );

    this.registerTools(server);

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    try {
      await server.connect(transport);
    } catch (error: unknown) {
      await server.close();
      throw error;
    }

    return { server, transport };
  }

  /** 에이전트가 사용하는 schema 조회와 프로젝트 산출물 도구 41개를 등록한다. */
  private registerTools(server: McpServer): void {
    /** SQLite 내부 객체를 제외한 실제 database schema 전체를 조회한다. */
    server.registerTool(
      "get_context",
      {
        title: "Get Context",
        description:
          "Returns the complete SQLite schema context, including DDL, tables, columns, indexes, and foreign-key relationships.",
        inputSchema: z.object({}).strict(),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      () => this.execute(() => this.getSchemaContext()),
    );

    /** projectId 유무에 따라 프로젝트 목록 또는 단일 프로젝트 context를 조회한다. */
    server.registerTool(
      "get_project",
      {
        title: "Get Project",
        description:
          "Returns all Projects when projectId is omitted, or the selected Project with its complete artifact context.",
        inputSchema: z.object({ projectId: projectIdSchema.optional() }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() =>
          projectId === undefined
            ? this.projectsService.list()
            : this.getProjectContext(projectId),
        ),
    );

    /** 선택한 프로젝트의 plan 목록을 조회한다. */
    server.registerTool(
      "get_plan",
      {
        title: "Get Plan",
        description: "Returns Plans owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.plansService.list({ projectId })),
    );

    /** 선택한 프로젝트의 asset 목록을 조회한다. */
    server.registerTool(
      "get_asset",
      {
        title: "Get Asset",
        description: "Returns Assets owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.assetsService.list({ projectId })),
    );

    /** 선택한 프로젝트의 design 목록을 조회한다. */
    server.registerTool(
      "get_design",
      {
        title: "Get Design",
        description: "Returns Designs owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.designsService.list({ projectId })),
    );

    /** 선택한 프로젝트의 PLAN과 PRODUCTION architecture를 함께 조회한다. */
    server.registerTool(
      "get_architecture",
      {
        title: "Get Architecture",
        description:
          "Returns the PLAN and PRODUCTION Architectures owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.architecturesService.list({ projectId })),
    );

    /** 선택한 프로젝트의 request 목록을 조회한다. */
    server.registerTool(
      "get_request",
      {
        title: "Get Request",
        description: "Returns Requests owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.requestsService.list({ projectId })),
    );

    /** 선택한 프로젝트의 work log 목록을 조회한다. */
    server.registerTool(
      "get_workLog",
      {
        title: "Get Work Log",
        description: "Returns Work Logs owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.worklogsService.list({ projectId })),
    );

    /** 선택한 프로젝트의 domain 목록을 조회한다. */
    server.registerTool(
      "get_domain",
      {
        title: "Get Domain",
        description: "Returns Domains owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.domainsService.list({ projectId })),
    );

    /** 선택한 프로젝트 전체 또는 특정 plan의 task 목록을 조회한다. */
    server.registerTool(
      "get_task",
      {
        title: "Get Task",
        description:
          "Returns Tasks owned by the selected Project, optionally filtered by Plan.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          planId: planIdSchema.optional(),
        }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId, planId }) =>
        this.execute(() => this.tasksService.list({ projectId, planId })),
    );

    /** 선택한 프로젝트의 draft 목록을 조회한다. */
    server.registerTool(
      "get_draft",
      {
        title: "Get Draft",
        description: "Returns Drafts owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.draftsService.list({ projectId })),
    );

    /** 선택한 프로젝트의 wireframe 목록을 조회한다. */
    server.registerTool(
      "get_wireframe",
      {
        title: "Get Wireframe",
        description: "Returns Wireframes owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.wireframesService.list({ projectId })),
    );

    /** 선택한 프로젝트의 review 목록을 조회한다. */
    server.registerTool(
      "get_review",
      {
        title: "Get Review",
        description: "Returns Reviews owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.reviewsService.list({ projectId })),
    );

    /** 선택한 프로젝트의 DB schema 문서 목록을 조회한다. */
    server.registerTool(
      "get_db",
      {
        title: "Get DB Schema Document",
        description:
          "Returns DB schema documents owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.dbService.list({ projectId })),
    );

    /** 선택한 프로젝트의 ERD 문서 목록을 조회한다. */
    server.registerTool(
      "get_erd",
      {
        title: "Get ERD",
        description: "Returns ERDs owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.erdService.list({ projectId })),
    );

    /** 선택한 프로젝트의 file 목록을 조회한다. */
    server.registerTool(
      "get_file",
      {
        title: "Get File",
        description: "Returns Files owned by the selected Project.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.filesService.list({ projectId })),
    );

    /** 하나 이상의 repository 경로를 연결한 프로젝트를 생성한다. */
    server.registerTool(
      "create_project",
      {
        title: "Create Project",
        description: "Creates a Project for one or more repositories.",
        inputSchema: z.object({
          title: z.string().trim().min(1),
          repoPaths: z
            .array(
              z.object({
                path: z.string().trim().min(1),
                repoType: z.enum(["LOCAL", "REMOTE"]),
              }),
            )
            .min(1),
          description: z.string().trim().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.projectsService.create(input)),
    );

    /** 프로젝트에 초기 PENDING 상태의 plan을 생성한다. */
    server.registerTool(
      "create_plan",
      {
        title: "Create Plan",
        description: "Creates a Plan for a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.plansService.create(input)),
    );

    /** 같은 프로젝트가 소유한 plan의 제목과 내용을 교체한다. */
    server.registerTool(
      "update_plan",
      {
        title: "Update Plan",
        description:
          "Replaces the title and content of a Plan in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          planId: planIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.plansService.update(input)),
    );

    /** 프로젝트에 text draft를 생성한다. */
    server.registerTool(
      "create_draft",
      {
        title: "Create Draft",
        description: "Creates a text Draft for a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.draftsService.create(input)),
    );

    /** 프로젝트의 root 또는 child Markdown Domain 페이지를 생성한다. */
    server.registerTool(
      "create_domain",
      {
        title: "Create Domain",
        description:
          "Creates one unique Markdown business-domain page as a root or child Domain in a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          parentId: domainParentIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.domainsService.create(input)),
    );

    /** 기존 Markdown Domain 페이지의 문서와 선택적 부모 관계를 갱신한다. */
    server.registerTool(
      "update_domain",
      {
        title: "Update Domain",
        description:
          "Updates a Markdown business-domain page; omit parentId to preserve its parent, use null for a root, or pass an ID to reparent it.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          domainId: domainIdSchema,
          parentId: domainParentIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.domainsService.update(input)),
    );

    /** 프로젝트의 현행 DB 스키마를 테이블 단위 Markdown 문서로 생성한다. */
    server.registerTool(
      "create_db",
      {
        title: "Create DB Schema Document",
        description:
          "Creates a table-oriented Markdown document for the current database schema of a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.dbService.create(input)),
    );

    /** 같은 프로젝트가 소유한 DB 스키마 문서의 제목과 Markdown 내용을 교체한다. */
    server.registerTool(
      "update_db",
      {
        title: "Update DB Schema Document",
        description:
          "Replaces the title and Markdown content of a DB schema document in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          dbId: dbIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.dbService.update(input)),
    );

    /** 프로젝트의 현행 DB 관계를 표현한 Dineug v3 ERD document를 생성한다. */
    server.registerTool(
      "create_erd",
      {
        title: "Create ERD",
        description:
          "Creates a validated Dineug v3 entity-relationship document for the current database schema of a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          document: dineugErdDocumentSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.erdService.create(input)),
    );

    /** 같은 프로젝트가 소유한 ERD의 제목과 Dineug v3 document를 교체한다. */
    server.registerTool(
      "update_erd",
      {
        title: "Update ERD",
        description:
          "Replaces the title and Dineug v3 document of an ERD in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          erdId: erdIdSchema,
          title: z.string().trim().min(1),
          document: dineugErdDocumentSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.erdService.update(input)),
    );

    /** 선택한 plan에 task를 생성한다. */
    server.registerTool(
      "create_task",
      {
        title: "Create Task",
        description: "Creates a Task under a Plan in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          planId: planIdSchema,
          title: z.string().trim().min(1),
          content: z.string().optional(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.tasksService.create(input)),
    );

    /** 같은 프로젝트가 소유한 task의 상태를 갱신하고 plan 상태를 동기화한다. */
    server.registerTool(
      "update_task",
      {
        title: "Update Task",
        description:
          "Updates a Task status in the same Project and synchronizes its Plan status.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          taskId: taskIdSchema,
          status: z.enum(["PENDING", "COMPLETED"]),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId, taskId, status }) =>
        this.execute(() =>
          this.tasksService.updateStatus(projectId, taskId, status),
        ),
    );

    /** 같은 프로젝트의 wireframe과 asset을 조합한 HTML design을 생성한다. */
    server.registerTool(
      "create_design",
      {
        title: "Create Design",
        description:
          "Creates production-ready HTML by combining a Wireframe and Asset from the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          wireframeId: z.number().int().positive(),
          assetId: z.number().int().positive(),
          title: z.string().trim().min(1),
          html: htmlSchema,
          version: designVersionSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.designsService.create(input)),
    );

    /** 같은 프로젝트가 소유한 HTML design의 제목과 내용을 교체한다. */
    server.registerTool(
      "update_design",
      {
        title: "Update Design",
        description:
          "Replaces the title and HTML of a Design in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          designId: designIdSchema,
          title: z.string().trim().min(1),
          html: htmlSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.designsService.update(input)),
    );

    /** 프로젝트에 속한 HTML wireframe을 생성한다. */
    server.registerTool(
      "create_wireframe",
      {
        title: "Create Wireframe",
        description: "Creates an HTML Wireframe for a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          parentId: wireframeIdSchema.nullable(),
          index: wireframeIndexSchema,
          title: z.string().trim().min(1),
          html: htmlSchema,
          version: wireframeVersionSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.wireframesService.create(input)),
    );

    /** 같은 프로젝트가 소유한 HTML wireframe의 제목과 내용을 교체한다. */
    server.registerTool(
      "update_wireframe",
      {
        title: "Update Wireframe",
        description:
          "Replaces the title and HTML of a Wireframe in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          wireframeId: wireframeIdSchema,
          parentId: wireframeIdSchema.nullable(),
          index: wireframeIndexSchema,
          title: z.string().trim().min(1),
          html: htmlSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.wireframesService.update(input)),
    );

    /** 프로젝트에 속한 HTML asset을 생성한다. */
    server.registerTool(
      "create_asset",
      {
        title: "Create Asset",
        description: "Creates an HTML Asset for a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          html: htmlSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.assetsService.create(input)),
    );

    /** 같은 프로젝트가 소유한 HTML asset의 제목과 내용을 교체한다. */
    server.registerTool(
      "update_asset",
      {
        title: "Update Asset",
        description:
          "Replaces the title and HTML of an Asset in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          assetId: assetIdSchema,
          title: z.string().trim().min(1),
          html: htmlSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.assetsService.update(input)),
    );

    /** 프로젝트에 Base64 파일을 임시 바이너리 데이터로 저장한다. */
    server.registerTool(
      "create_file",
      {
        title: "Create File",
        description:
          "Creates a temporary Project file from Base64-encoded content and calculates its byte size.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          mimeType: z.string().trim().min(1),
          content: z.base64().describe("Base64-encoded file content"),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.filesService.create(input)),
    );

    /** 파일의 원격 업로드 완료 상태와 URL을 기록하고 임시 바이너리를 비운다. */
    server.registerTool(
      "update_file",
      {
        title: "Update File",
        description:
          "Marks a Project file as uploaded, records its remote URL, and clears temporary binary content.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          fileId: fileIdSchema,
          uploadUrl: z.url(),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.filesService.update(input)),
    );

    /** 같은 프로젝트가 소유한 파일 레코드를 삭제한다. */
    server.registerTool(
      "delete_file",
      {
        title: "Delete File",
        description: "Deletes a File owned by the selected Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          fileId: fileIdSchema,
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.filesService.delete(input)),
    );

    /** 프로젝트에 text 작업 내역을 생성한다. */
    server.registerTool(
      "create_workLog",
      {
        title: "Create Work Log",
        description: "Creates a text Work Log for a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.worklogsService.create(input)),
    );

    /** 프로젝트에 PENDING 상태의 text 작업 요청을 생성한다. */
    server.registerTool(
      "create_request",
      {
        title: "Create Request",
        description: "Creates a pending text Request for a Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.requestsService.create(input)),
    );

    /** 프로젝트의 PLAN 또는 PRODUCTION Architecture를 type 기준으로 upsert한다. */
    server.registerTool(
      "upsert_architecture",
      {
        title: "Upsert Architecture",
        description:
          "Creates or replaces one typed Architecture for a Project: PLAN uses Markdown and complete HTML, while PRODUCTION uses a validated deployment diagram.",
        inputSchema: architectureUpsertSchema,
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.architecturesService.upsert(input)),
    );

    /** 같은 프로젝트가 소유한 작업 요청의 내용과 진행 상태를 교체한다. */
    server.registerTool(
      "update_request",
      {
        title: "Update Request",
        description:
          "Replaces the title, content, and status of a Request in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          requestId: requestIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
          status: z.enum(["PENDING", "IN_PROGRESS", "COMPLETED"]),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.requestsService.update(input)),
    );
  }

  /** SQLite catalog와 PRAGMA를 조합해 agent용 database schema context를 만든다. */
  private async getSchemaContext() {
    const schemaObjectRows = await this.prismaService.$queryRaw<
      SqliteSchemaObjectRow[]
    >`
      SELECT
        type,
        name,
        tbl_name AS "tableName",
        sql
      FROM sqlite_schema
      WHERE type IN ('table', 'index', 'view', 'trigger')
        AND name NOT LIKE 'sqlite_%'
      ORDER BY type, name
    `;

    const schemaObjects = [...schemaObjectRows].sort(
      (left, right) =>
        left.type.localeCompare(right.type) ||
        left.name.localeCompare(right.name),
    );
    const schemaObjectByName = new Map(
      schemaObjects.map((schemaObject) => [schemaObject.name, schemaObject]),
    );
    const tableObjects = schemaObjects
      .filter(({ type }) => type === "table")
      .sort((left, right) => left.name.localeCompare(right.name));

    const tables = await Promise.all(
      tableObjects.map(async ({ name, sql }) => {
        const [columnRows, indexRows, foreignKeyRows] = await Promise.all([
          this.prismaService.$queryRaw<SqliteColumnRow[]>`
            SELECT
              cid,
              name,
              type,
              "notnull" AS "notNull",
              dflt_value AS "defaultValue",
              pk AS "primaryKeyOrdinal",
              hidden
            FROM pragma_table_xinfo(${name})
            ORDER BY cid
          `,
          this.prismaService.$queryRaw<SqliteIndexRow[]>`
            SELECT
              name,
              "unique" AS "isUnique",
              origin,
              partial
            FROM pragma_index_list(${name})
            ORDER BY name
          `,
          this.prismaService.$queryRaw<SqliteForeignKeyRow[]>`
            SELECT
              id,
              seq AS "sequence",
              "table" AS "referencedTable",
              "from" AS "fromColumn",
              "to" AS "toColumn",
              on_update AS "onUpdate",
              on_delete AS "onDelete",
              match
            FROM pragma_foreign_key_list(${name})
            ORDER BY id, seq
          `,
        ]);

        const columns = columnRows
          .map((column) => ({
            ordinal: toNumber(column.cid),
            name: column.name,
            dataType: column.type,
            notNull: toBoolean(column.notNull),
            defaultValue: column.defaultValue,
            primaryKeyOrdinal: toNumber(column.primaryKeyOrdinal),
            hidden: toNumber(column.hidden),
          }))
          .sort((left, right) => left.ordinal - right.ordinal);

        const indexes = await Promise.all(
          indexRows
            .sort((left, right) => left.name.localeCompare(right.name))
            .map(async (index) => {
              const indexColumnRows = await this.prismaService.$queryRaw<
                SqliteIndexColumnRow[]
              >`
                SELECT
                  seqno AS "sequence",
                  cid AS "columnId",
                  name,
                  "desc" AS "descending",
                  coll AS "collation",
                  "key"
                FROM pragma_index_xinfo(${index.name})
                ORDER BY seqno
              `;

              return {
                name: index.name,
                unique: toBoolean(index.isUnique),
                origin: index.origin,
                partial: toBoolean(index.partial),
                sql: schemaObjectByName.get(index.name)?.sql ?? null,
                columns: indexColumnRows
                  .map((column) => ({
                    sequence: toNumber(column.sequence),
                    columnId: toNumber(column.columnId),
                    name: column.name,
                    descending: toBoolean(column.descending),
                    collation: column.collation,
                    key: toBoolean(column.key),
                  }))
                  .sort((left, right) => left.sequence - right.sequence),
              };
            }),
        );

        const foreignKeysById = new Map<
          number,
          {
            id: number;
            referencedTable: string;
            onUpdate: string;
            onDelete: string;
            match: string;
            columns: Array<{
              sequence: number;
              from: string;
              to: string | null;
            }>;
          }
        >();

        for (const row of foreignKeyRows) {
          const id = toNumber(row.id);
          const foreignKey = foreignKeysById.get(id) ?? {
            id,
            referencedTable: row.referencedTable,
            onUpdate: row.onUpdate,
            onDelete: row.onDelete,
            match: row.match,
            columns: [],
          };

          foreignKey.columns.push({
            sequence: toNumber(row.sequence),
            from: row.fromColumn,
            to: row.toColumn,
          });
          foreignKeysById.set(id, foreignKey);
        }

        const foreignKeys = [...foreignKeysById.values()]
          .map((foreignKey) => ({
            ...foreignKey,
            columns: foreignKey.columns.sort(
              (left, right) => left.sequence - right.sequence,
            ),
          }))
          .sort((left, right) => left.id - right.id);

        return { name, sql, columns, indexes, foreignKeys };
      }),
    );

    return { dialect: "sqlite", schemaObjects, tables };
  }

  /** 프로젝트 기본 정보와 11종 도메인 목록을 하나의 MCP context로 조립한다. */
  private async getProjectContext(projectId: number) {
    /** 독립적인 도메인 조회를 병렬 실행해 MCP 응답 지연을 줄인다. */
    const [
      projects,
      plans,
      tasks,
      drafts,
      domains,
      architectures,
      wireframes,
      assets,
      designs,
      databases,
      erds,
      reviews,
    ] = await Promise.all([
      this.projectsService.list(),
      this.plansService.list({ projectId }),
      this.tasksService.list({ projectId }),
      this.draftsService.list({ projectId }),
      this.domainsService.list({ projectId }),
      this.architecturesService.list({ projectId }),
      this.wireframesService.list({ projectId }),
      this.assetsService.list({ projectId }),
      this.designsService.list({ projectId }),
      this.dbService.list({ projectId }),
      this.erdService.list({ projectId }),
      this.reviewsService.list({ projectId }),
    ]);

    /** 프로젝트 목록의 summary에서 context 기본 필드만 선택한다. */
    const project = projects.find(({ id }) => id === projectId);
    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }

    /** ProjectSummary의 집계 필드를 제외한 완전한 context를 반환한다. */
    return {
      id: project.id,
      title: project.title,
      repoPaths: project.repoPaths,
      description: project.description,
      plans,
      tasks,
      drafts,
      domains,
      architectures,
      wireframes,
      assets,
      designs,
      databases,
      erds,
      reviews,
    };
  }

  /** 도메인 서비스 결과와 오류를 MCP text content 규격으로 변환한다. */
  private async execute(
    operation: () => Promise<unknown>,
  ): Promise<CallToolResult> {
    try {
      const result = await operation();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown MCP tool error";
      const status = error instanceof HttpException ? error.getStatus() : 500;
      const code = error instanceof Error ? error.name : "UnknownError";
      this.logger.error(
        message,
        error instanceof Error ? error.stack : undefined,
      );

      return {
        isError: true,
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: { code, status, message } }),
          },
        ],
      };
    }
  }
}

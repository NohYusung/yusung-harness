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
import { ArchitecturesService } from "../services/architectures/architectures.service";
import { AssetsService } from "../services/assets/assets.service";
import { DesignsService } from "../services/designs/designs.service";
import { DomainsService } from "../services/domains/domains.service";
import { DraftsService } from "../services/drafts/drafts.service";
import { PlansService } from "../services/plans/plans.service";
import { ProjectsService } from "../services/projects/projects.service";
import { ReviewsService } from "../services/reviews/reviews.service";
import { TasksService } from "../services/tasks/tasks.service";
import { WireframesService } from "../services/wireframes/wireframes.service";

const projectIdSchema = z.number().int().positive().describe("Project ID");
const taskIdSchema = z.number().int().positive().describe("Task ID");
const htmlSchema = z
  .string()
  .min(1)
  .describe("Complete HTML document including doctype, html, head, and body");

/** HTTP 요청 단위로 생성한 MCP server와 stateless transport 조합. */
export interface McpConnection {
  server: McpServer;
  transport: StreamableHTTPServerTransport;
}

@Injectable()
export class McpService {
  private readonly logger = new Logger(McpService.name);

  constructor(
    private readonly projectsService: ProjectsService,
    private readonly plansService: PlansService,
    private readonly tasksService: TasksService,
    private readonly draftsService: DraftsService,
    private readonly domainsService: DomainsService,
    private readonly architecturesService: ArchitecturesService,
    private readonly wireframesService: WireframesService,
    private readonly assetsService: AssetsService,
    private readonly designsService: DesignsService,
    private readonly reviewsService: ReviewsService,
  ) {}

  /** 8개 도구를 등록한 stateless MCP 연결을 생성한다. */
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

  /** 에이전트가 사용하는 프로젝트 조회와 산출물 생성 도구 8개를 등록한다. */
  private registerTools(server: McpServer): void {
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

    /** repository 경로와 유형을 고유 키로 프로젝트를 생성한다. */
    server.registerTool(
      "create_project",
      {
        title: "Create Project",
        description: "Creates a Project for the selected repository.",
        inputSchema: z.object({
          title: z.string().trim().min(1),
          repoPath: z.string().trim().min(1),
          repoType: z.enum(["LOCAL", "REMOTE"]),
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

    /** 프로젝트의 다음 plan version과 선택적인 초기 task를 생성한다. */
    server.registerTool(
      "create_plan",
      {
        title: "Create Plan",
        description:
          "Creates the next Plan version and optionally creates its initial Tasks.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          title: z.string().trim().min(1),
          content: z.string().min(1),
          tasks: z
            .array(
              z.object({
                title: z.string().trim().min(1),
                content: z.string().optional(),
              }),
            )
            .default([]),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.plansService.createVersion(input)),
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
      (input) => this.execute(() => this.draftsService.save(input)),
    );

    /** 선택한 plan에 task를 생성한다. */
    server.registerTool(
      "create_task",
      {
        title: "Create Task",
        description: "Creates a Task under a Plan in the same Project.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          planId: z.number().int().positive(),
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

    /** 같은 task의 wireframe과 asset을 조합한 HTML design을 생성한다. */
    server.registerTool(
      "create_design",
      {
        title: "Create Design",
        description:
          "Creates production-ready HTML by combining a Wireframe and Asset from the same Project, Plan, and Task.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          taskId: taskIdSchema,
          wireframeId: z.number().int().positive(),
          assetId: z.number().int().positive(),
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
      (input) => this.execute(() => this.designsService.save(input)),
    );

    /** task에 연결된 HTML wireframe을 생성한다. */
    server.registerTool(
      "create_wireframe",
      {
        title: "Create Wireframe",
        description: "Creates an HTML Wireframe for a Task.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          taskId: taskIdSchema,
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
      (input) => this.execute(() => this.wireframesService.save(input)),
    );

    /** task에 연결된 HTML asset을 생성한다. */
    server.registerTool(
      "create_asset",
      {
        title: "Create Asset",
        description: "Creates an HTML Asset for a Task.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          taskId: taskIdSchema,
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
      (input) => this.execute(() => this.assetsService.save(input)),
    );
  }

  /** 프로젝트 기본 정보와 9종 도메인 목록을 하나의 MCP context로 조립한다. */
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
      reviews,
    ] = await Promise.all([
      this.projectsService.list(),
      this.plansService.list(
        { projectId },
        { orderBy: { version: "desc" } },
      ),
      this.tasksService.list({ projectId }),
      this.draftsService.list({ projectId }),
      this.domainsService.list({ projectId }),
      this.architecturesService.list({ projectId }),
      this.wireframesService.list({ projectId }),
      this.assetsService.list({ projectId }),
      this.designsService.list({ projectId }),
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
      repoPath: project.repoPath,
      repoType: project.repoType,
      description: project.description,
      plans,
      tasks,
      drafts,
      domains,
      architectures,
      wireframes,
      assets,
      designs,
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

import { Injectable, Logger } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";
import { ArchitecturesService } from "../architectures/architectures.service";
import { AssetsService } from "../assets/assets.service";
import { DesignsService } from "../designs/designs.service";
import { DraftsService } from "../drafts/drafts.service";
import { PlansService } from "../plans/plans.service";
import { ProjectsService } from "../projects/projects.service";
import { ReviewsService } from "../reviews/reviews.service";
import { TasksService } from "../tasks/tasks.service";
import { WireframesService } from "../wireframes/wireframes.service";

const projectIdSchema = z.number().int().positive().describe("Project ID");
const documentIdSchema = z.number().int().positive().optional();

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
    private readonly draftsService: DraftsService,
    private readonly architecturesService: ArchitecturesService,
    private readonly wireframesService: WireframesService,
    private readonly assetsService: AssetsService,
    private readonly designsService: DesignsService,
    private readonly reviewsService: ReviewsService,
    private readonly tasksService: TasksService,
  ) {}

  async createConnection(): Promise<McpConnection> {
    const server = new McpServer(
      {
        name: "yusung-harness-doc",
        version: "0.1.0",
      },
      {
        instructions: [
          "이 MCP 서버는 yusung-harness 에이전트의 작업 내역과 산출물을 프로젝트별로 SQLite에 보관한다.",
          "먼저 upsert_project로 프로젝트를 등록하고 반환된 projectId를 이후 모든 쓰기 도구에 전달한다.",
          "문서를 수정할 때는 기존 id를 전달하고, 새 버전을 남겨야 하는 계획은 create_plan_version을 사용한다.",
          "작업 시작 전 get_project_context로 현재 상태를 확인하고, 연관 ID는 반드시 같은 projectId에 속해야 한다.",
        ].join("\n"),
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

  private registerTools(server: McpServer): void {
    server.registerTool(
      "upsert_project",
      {
        title: "프로젝트 등록 또는 갱신",
        description:
          "저장소 경로와 유형을 고유 키로 프로젝트를 등록하거나 제목·설명을 갱신한다.",
        inputSchema: z.object({
          title: z.string().trim().min(1),
          repoPath: z.string().trim().min(1),
          repoType: z.enum(["LOCAL", "REMOTE"]),
          description: z.string().trim().min(1),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      (input) => this.execute(() => this.projectsService.upsert(input)),
    );

    server.registerTool(
      "get_project_context",
      {
        title: "프로젝트 전체 컨텍스트 조회",
        description:
          "프로젝트의 계획·작업·기획·아키텍처·와이어프레임·에셋·디자인·리뷰를 한 번에 조회한다.",
        inputSchema: z.object({ projectId: projectIdSchema }),
        annotations: {
          readOnlyHint: true,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: false,
        },
      },
      ({ projectId }) =>
        this.execute(() => this.projectsService.getContext(projectId)),
    );

    server.registerTool(
      "create_plan_version",
      {
        title: "계획 버전 생성",
        description:
          "프로젝트의 다음 계획 버전을 만들고 선택적으로 초기 작업 목록도 함께 생성한다.",
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

    server.registerTool(
      "save_document",
      {
        title: "산출물 저장",
        description:
          "기획·아키텍처·와이어프레임·에셋·리뷰 산출물을 생성한다. 기존 id를 전달하면 같은 프로젝트의 문서를 갱신한다.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          kind: z.enum(["DRAFT", "ARCHITECTURE", "WIREFRAME", "ASSET", "REVIEW"]),
          id: documentIdSchema,
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
      (input) => this.execute(() => this.saveDocument(input)),
    );

    server.registerTool(
      "save_design",
      {
        title: "디자인 저장",
        description:
          "같은 프로젝트에 속한 와이어프레임과 에셋을 연결해 디자인을 생성하거나 갱신한다.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          id: documentIdSchema,
          wireframeId: z.number().int().positive(),
          assetId: z.number().int().positive(),
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
      (input) => this.execute(() => this.designsService.save(input)),
    );

    server.registerTool(
      "create_task",
      {
        title: "작업 생성",
        description: "같은 프로젝트에 속한 계획 아래에 작업을 생성한다.",
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

    server.registerTool(
      "update_task_status",
      {
        title: "작업 상태 변경",
        description: "프로젝트 소속을 검증한 뒤 작업 상태를 변경한다.",
        inputSchema: z.object({
          projectId: projectIdSchema,
          taskId: z.number().int().positive(),
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
        this.execute(() => this.tasksService.updateStatus(projectId, taskId, status)),
    );
  }

  private saveDocument({
    projectId,
    kind,
    id,
    title,
    content,
  }: {
    projectId: number;
    kind: "DRAFT" | "ARCHITECTURE" | "WIREFRAME" | "ASSET" | "REVIEW";
    id?: number;
    title: string;
    content: string;
  }) {
    const input = { projectId, id, title, content };

    switch (kind) {
      case "DRAFT":
        return this.draftsService.save(input);
      case "ARCHITECTURE":
        return this.architecturesService.save(input);
      case "WIREFRAME":
        return this.wireframesService.save(input);
      case "ASSET":
        return this.assetsService.save(input);
      case "REVIEW":
        return this.reviewsService.save(input);
    }
  }

  private async execute(operation: () => Promise<unknown>): Promise<CallToolResult> {
    try {
      const result = await operation();
      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown MCP tool error";
      this.logger.error(message, error instanceof Error ? error.stack : undefined);

      return {
        isError: true,
        content: [{ type: "text", text: message }],
      };
    }
  }
}

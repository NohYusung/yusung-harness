import { BadRequestException, Injectable } from "@nestjs/common";
import { ArchitectureType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { serializeDeploymentArchitecture } from "./deployment-architecture";

/** Architecture PLAN 저장 입력. */
export type ArchitecturePlanUpsertInput = {
  projectId: number;
  type: typeof ArchitectureType.PLAN;
  title: string;
  content: string;
  html: string;
};

/** Architecture PRODUCTION 저장 입력. */
export type ArchitectureProductionUpsertInput = {
  projectId: number;
  type: typeof ArchitectureType.PRODUCTION;
  title: string;
  diagram: unknown;
};

/** type에 따라 저장 payload가 좁혀지는 통합 Architecture 입력. */
export type ArchitectureUpsertInput =
  | ArchitecturePlanUpsertInput
  | ArchitectureProductionUpsertInput;

/** PLAN HTML이 독립적으로 렌더링 가능한 완전한 문서인지 확인한다. */
function isCompleteHtmlDocument(html: string): boolean {
  const document = html.trim();

  return (
    /^<!doctype\s+html\s*>/i.test(document) &&
    /<html(?:\s[^>]*)?>[\s\S]*<\/html>\s*$/i.test(document) &&
    /<head(?:\s[^>]*)?>[\s\S]*<\/head>/i.test(document) &&
    /<body(?:\s[^>]*)?>[\s\S]*<\/body>/i.test(document)
  );
}

@Injectable()
export class ArchitecturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 Architecture를 PLAN, PRODUCTION 순서로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.architecture.findMany({
      where: { projectId },
      orderBy: [{ type: "asc" }],
    });
  }

  /** PLAN 또는 PRODUCTION Architecture를 type별 단일 레코드로 생성·갱신한다. */
  async upsert(input: ArchitectureUpsertInput) {
    const { projectId, type, title } = input;
    await this.projectsService.ensureProject(projectId);

    /** PLAN은 Markdown 본문과 독립 실행 가능한 HTML 구조도를 함께 저장한다. */
    if (type === ArchitectureType.PLAN) {
      if (!input.content.trim()) {
        throw new BadRequestException(
          "Architecture PLAN content must not be empty",
        );
      }

      if (!isCompleteHtmlDocument(input.html)) {
        throw new BadRequestException(
          "Architecture PLAN html must be a complete HTML document",
        );
      }

      const data = {
        projectId,
        type,
        title,
        content: input.content,
        html: input.html,
      };

      return this.prisma.architecture.upsert({
        where: { projectId_type: { projectId, type } },
        create: data,
        update: { title, content: input.content, html: input.html },
      });
    }

    /** PRODUCTION은 graph를 canonical JSON으로 직렬화하고 HTML을 비운다. */
    const content = serializeDeploymentArchitecture(input.diagram);
    const data = { projectId, type, title, content, html: "" };

    return this.prisma.architecture.upsert({
      where: { projectId_type: { projectId, type } },
      create: data,
      update: { title, content, html: "" },
    });
  }
}

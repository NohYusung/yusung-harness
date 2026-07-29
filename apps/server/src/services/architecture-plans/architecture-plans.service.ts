import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ArchitecturePlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 아키텍처 설계 계획을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.architecturePlan.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트에 Markdown 설명과 HTML 구조도를 포함한 아키텍처 설계 계획을 생성한다. */
  async create({
    projectId,
    title,
    content,
    html,
  }: {
    projectId: number;
    title: string;
    content: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    try {
      return await this.prisma.architecturePlan.create({
        data: { projectId, title, content, html },
      });
    } catch (error: unknown) {
      /** projectId unique 충돌은 호출자가 처리 가능한 domain 오류로 변환한다. */
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new BadRequestException(
          `Architecture Plan already exists for project ${projectId}`,
        );
      }

      throw error;
    }
  }

  /** 같은 프로젝트가 소유한 아키텍처 설계 계획의 제목, Markdown, HTML을 갱신한다. */
  async update({
    projectId,
    architecturePlanId,
    title,
    content,
    html,
  }: {
    projectId: number;
    architecturePlanId: number;
    title: string;
    content: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingArchitecturePlan =
      await this.prisma.architecturePlan.findUnique({
        where: { id: architecturePlanId },
      });

    if (!existingArchitecturePlan) {
      throw new NotFoundException(
        `ArchitecturePlan ${architecturePlanId} not found`,
      );
    }

    if (existingArchitecturePlan.projectId !== projectId) {
      throw new BadRequestException(
        `ArchitecturePlan ${architecturePlanId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.architecturePlan.update({
      where: { id: architecturePlanId },
      data: { title, content, html },
    });
  }
}

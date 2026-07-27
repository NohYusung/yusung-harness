import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트 계획 목록을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.plan.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /** 프로젝트에 초기 PENDING 상태의 계획을 생성한다. */
  async create({
    projectId,
    title,
    content,
  }: {
    projectId: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.plan.create({
      data: { projectId, title, content },
    });
  }

  async ensurePlan(projectId: number, planId: number) {
    const plan = await this.prisma.plan.findUnique({ where: { id: planId } });

    if (!plan) {
      throw new NotFoundException(`Plan ${planId} not found`);
    }

    if (plan.projectId !== projectId) {
      throw new BadRequestException(
        `Plan ${planId} does not belong to project ${projectId}`,
      );
    }

    return plan;
  }
}

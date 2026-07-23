import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 호출자가 지정한 정렬 옵션으로 프로젝트 계획 목록을 조회한다. */
  async list(
    { projectId }: { projectId: number },
    options?: Pick<Prisma.PlanFindManyArgs, "orderBy">,
  ) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.plan.findMany({
      where: { projectId },
      ...options,
      include: {
        tasks: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  }

  /** 다음 version의 plan만 transaction으로 생성한다. */
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

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (transaction) => {
          const latestPlan = await transaction.plan.findFirst({
            where: { projectId },
            orderBy: { version: "desc" },
            select: { version: true },
          });

          return transaction.plan.create({
            data: {
              projectId,
              title,
              content,
              version: (latestPlan?.version ?? 0) + 1,
            },
          });
        });
      } catch (error: unknown) {
        const isVersionConflict =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";

        if (!isVersionConflict || attempt === 2) {
          throw error;
        }
      }
    }

    throw new Error("Failed to allocate the next plan version");
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

import { Injectable } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async createVersion({
    projectId,
    title,
    content,
    tasks,
  }: {
    projectId: number;
    title: string;
    content: string;
    tasks: Array<{ title: string; content?: string }>;
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
              tasks: {
                create: tasks.map((task) => ({
                  projectId,
                  title: task.title,
                  content: task.content,
                })),
              },
            },
            include: { tasks: true },
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
}

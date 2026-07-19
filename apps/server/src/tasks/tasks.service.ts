import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { TaskStatus } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

export interface CreateTaskInput {
  projectId: number;
  planId: number;
  title: string;
  content?: string;
}

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async create({ projectId, planId, title, content }: CreateTaskInput) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.$transaction(async (transaction) => {
      const plan = await transaction.plan.findUnique({ where: { id: planId } });

      if (!plan) {
        throw new NotFoundException(`Plan ${planId} not found`);
      }

      if (plan.projectId !== projectId) {
        throw new BadRequestException(
          `Plan ${planId} does not belong to project ${projectId}`,
        );
      }

      return transaction.task.create({
        data: { projectId, planId, title, content },
      });
    });
  }

  async updateStatus(projectId: number, taskId: number, status: TaskStatus) {
    await this.projectsService.ensureProject(projectId);
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    if (task.projectId !== projectId) {
      throw new BadRequestException(
        `Task ${taskId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.task.update({
      where: { id: taskId },
      data: { status },
    });
  }
}

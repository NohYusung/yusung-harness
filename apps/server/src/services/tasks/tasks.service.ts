import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { TaskStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
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

  /** 프로젝트의 작업을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.task.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** plan 소유권을 검증하고 task를 transaction 안에서 생성한다. */
  async create({ projectId, planId, title, content }: CreateTaskInput) {
    await this.projectsService.ensureProject(projectId);

    const task = await this.prisma.$transaction(async (transaction) => {
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

    return task;
  }

  /** project 소유권을 검증하고 task 상태를 갱신한다. */
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

  async ensureTask(projectId: number, taskId: number) {
    const task = await this.prisma.task.findUnique({ where: { id: taskId } });

    if (!task) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }

    if (task.projectId !== projectId) {
      throw new BadRequestException(
        `Task ${taskId} does not belong to project ${projectId}`,
      );
    }

    return task;
  }
}

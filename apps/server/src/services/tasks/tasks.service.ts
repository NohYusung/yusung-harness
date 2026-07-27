import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PlanStatus, Prisma, TaskStatus } from "@prisma/client";
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

  /** 프로젝트 전체 또는 선택한 계획의 작업을 최근 수정순으로 조회한다. */
  async list({
    projectId,
    planId,
  }: {
    projectId: number;
    planId?: number;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.task.findMany({
      where: {
        projectId,
        ...(planId === undefined ? {} : { planId }),
      },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** plan 소유권을 검증하고 task 생성과 plan 상태 동기화를 transaction으로 묶는다. */
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

      const createdTask = await transaction.task.create({
        data: { projectId, planId, title, content },
      });

      await this.syncPlanStatus(transaction, planId);
      return createdTask;
    });

    return task;
  }

  /** project 소유권을 검증하고 task 및 plan 상태를 transaction 안에서 갱신한다. */
  async updateStatus(projectId: number, taskId: number, status: TaskStatus) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.$transaction(async (transaction) => {
      const task = await transaction.task.findUnique({ where: { id: taskId } });

      if (!task) {
        throw new NotFoundException(`Task ${taskId} not found`);
      }

      if (task.projectId !== projectId) {
        throw new BadRequestException(
          `Task ${taskId} does not belong to project ${projectId}`,
        );
      }

      const updatedTask = await transaction.task.update({
        where: { id: taskId },
        data: { status },
      });

      await this.syncPlanStatus(transaction, task.planId);
      return updatedTask;
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

  /** 현재 task 집계로 plan의 PENDING/IN_PROGRESS/COMPLETED 상태를 결정한다. */
  private async syncPlanStatus(
    transaction: Prisma.TransactionClient,
    planId: number,
  ): Promise<void> {
    const tasks = await transaction.task.findMany({
      where: { planId },
      select: { status: true },
    });
    const status: PlanStatus =
      tasks.length === 0
        ? "PENDING"
        : tasks.every((task) => task.status === "COMPLETED")
          ? "COMPLETED"
          : "IN_PROGRESS";

    await transaction.plan.update({
      where: { id: planId },
      data: { status },
    });
  }
}

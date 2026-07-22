import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { TasksService } from "../tasks/tasks.service";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
  ) {}

  /** 프로젝트의 asset을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.asset.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** task에 연결된 asset을 생성하거나 기존 record를 갱신한다. */
  async save({
    projectId,
    taskId,
    id,
    title,
    html,
  }: {
    projectId: number;
    taskId: number;
    id?: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const task = await this.tasksService.ensureTask(projectId, taskId);

    if (id) {
      const existingAsset = await this.prisma.asset.findUnique({
        where: { id },
      });

      if (!existingAsset) {
        throw new NotFoundException(`Asset ${id} not found`);
      }

      if (existingAsset.projectId !== projectId) {
        throw new BadRequestException(
          `Asset ${id} does not belong to project ${projectId}`,
        );
      }

      if (existingAsset.taskId !== taskId) {
        throw new BadRequestException(
          `Asset ${id} cannot be moved from Task ${existingAsset.taskId} to Task ${taskId}`,
        );
      }

      return this.prisma.asset.update({
        where: { id },
        data: { planId: task.planId, taskId, title, html },
      });
    }

    return this.prisma.asset.create({
      data: { projectId, planId: task.planId, taskId, title, html },
    });
  }
}

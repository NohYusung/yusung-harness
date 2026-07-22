import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { TasksService } from "../tasks/tasks.service";

@Injectable()
export class WireframesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
  ) {}

  /** 프로젝트의 wireframe을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.wireframe.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** task에 연결된 wireframe을 생성하거나 기존 record를 갱신한다. */
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
      const existingWireframe = await this.prisma.wireframe.findUnique({
        where: { id },
      });

      if (!existingWireframe) {
        throw new NotFoundException(`Wireframe ${id} not found`);
      }

      if (existingWireframe.projectId !== projectId) {
        throw new BadRequestException(
          `Wireframe ${id} does not belong to project ${projectId}`,
        );
      }

      if (existingWireframe.taskId !== taskId) {
        throw new BadRequestException(
          `Wireframe ${id} cannot be moved from Task ${existingWireframe.taskId} to Task ${taskId}`,
        );
      }

      return this.prisma.wireframe.update({
        where: { id },
        data: { planId: task.planId, taskId, title, html },
      });
    }

    return this.prisma.wireframe.create({
      data: { projectId, planId: task.planId, taskId, title, html },
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { TasksService } from "../tasks/tasks.service";

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly tasksService: TasksService,
  ) {}

  /** 프로젝트의 디자인을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.design.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      include: { wireframe: true, asset: true },
    });
  }

  /** 관련 산출물 검증과 design 저장을 하나의 transaction으로 처리한다. */
  async save({
    projectId,
    taskId,
    id,
    wireframeId,
    assetId,
    title,
    html,
  }: {
    projectId: number;
    taskId: number;
    id?: number;
    wireframeId: number;
    assetId: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const task = await this.tasksService.ensureTask(projectId, taskId);

    const design = await this.prisma.$transaction(async (transaction) => {
      const [wireframe, asset, design] = await Promise.all([
        transaction.wireframe.findUnique({ where: { id: wireframeId } }),
        transaction.asset.findUnique({ where: { id: assetId } }),
        id
          ? transaction.design.findUnique({ where: { id } })
          : Promise.resolve(null),
      ]);

      this.assertRelatedProject(wireframe, projectId, "Wireframe", wireframeId);
      this.assertRelatedProject(asset, projectId, "Asset", assetId);
      this.assertRelatedTask(wireframe, taskId, "Wireframe", wireframeId);
      this.assertRelatedTask(asset, taskId, "Asset", assetId);
      this.assertRelatedPlan(wireframe, task.planId, "Wireframe", wireframeId);
      this.assertRelatedPlan(asset, task.planId, "Asset", assetId);

      if (id) {
        this.assertRelatedProject(design, projectId, "Design", id);
        return transaction.design.update({
          where: { id },
          data: {
            planId: task.planId,
            taskId,
            wireframeId,
            assetId,
            title,
            html,
          },
        });
      }

      return transaction.design.create({
        data: {
          projectId,
          planId: task.planId,
          taskId,
          wireframeId,
          assetId,
          title,
          html,
        },
      });
    });

    return design;
  }

  private assertRelatedProject(
    record: { projectId: number } | null,
    projectId: number,
    label: string,
    id: number,
  ): asserts record is { projectId: number } {
    if (!record) {
      throw new NotFoundException(`${label} ${id} not found`);
    }

    if (record.projectId !== projectId) {
      throw new BadRequestException(
        `${label} ${id} does not belong to project ${projectId}`,
      );
    }
  }

  private assertRelatedTask(
    record: { taskId: number },
    taskId: number,
    label: string,
    id: number,
  ): void {
    if (record.taskId !== taskId) {
      throw new BadRequestException(
        `${label} ${id} does not belong to Task ${taskId}`,
      );
    }
  }

  private assertRelatedPlan(
    record: { planId: number },
    planId: number,
    label: string,
    id: number,
  ): void {
    if (record.planId !== planId) {
      throw new BadRequestException(
        `${label} ${id} does not belong to Plan ${planId}`,
      );
    }
  }
}

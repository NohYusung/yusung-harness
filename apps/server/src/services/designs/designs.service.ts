import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
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

  /** 관련 산출물 검증과 design 생성을 하나의 transaction으로 처리한다. */
  async create({
    projectId,
    wireframeId,
    assetId,
    title,
    html,
  }: {
    projectId: number;
    wireframeId: number;
    assetId: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    const design = await this.prisma.$transaction(async (transaction) => {
      const [wireframe, asset] = await Promise.all([
        transaction.wireframe.findUnique({ where: { id: wireframeId } }),
        transaction.asset.findUnique({ where: { id: assetId } }),
      ]);

      this.assertRelatedProject(wireframe, projectId, "Wireframe", wireframeId);
      this.assertRelatedProject(asset, projectId, "Asset", assetId);

      return transaction.design.create({
        data: {
          projectId,
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
}

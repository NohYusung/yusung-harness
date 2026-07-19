import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async save({
    projectId,
    id,
    wireframeId,
    assetId,
    title,
    content,
  }: {
    projectId: number;
    id?: number;
    wireframeId: number;
    assetId: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.$transaction(async (transaction) => {
      const [wireframe, asset, design] = await Promise.all([
        transaction.wireframe.findUnique({ where: { id: wireframeId } }),
        transaction.asset.findUnique({ where: { id: assetId } }),
        id ? transaction.design.findUnique({ where: { id } }) : Promise.resolve(null),
      ]);

      this.assertRelatedProject(wireframe, projectId, "Wireframe", wireframeId);
      this.assertRelatedProject(asset, projectId, "Asset", assetId);

      if (id) {
        this.assertRelatedProject(design, projectId, "Design", id);
        return transaction.design.update({
          where: { id },
          data: { wireframeId, assetId, title, content },
        });
      }

      return transaction.design.create({
        data: { projectId, wireframeId, assetId, title, content },
      });
    });
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

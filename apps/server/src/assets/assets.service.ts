import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  async save({
    projectId,
    id,
    title,
    content,
  }: {
    projectId: number;
    id?: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    if (id) {
      const asset = await this.prisma.asset.findUnique({ where: { id } });

      if (!asset) {
        throw new NotFoundException(`Asset ${id} not found`);
      }

      if (asset.projectId !== projectId) {
        throw new BadRequestException(
          `Asset ${id} does not belong to project ${projectId}`,
        );
      }

      return this.prisma.asset.update({
        where: { id },
        data: { title, content },
      });
    }

    return this.prisma.asset.create({
      data: { projectId, title, content },
    });
  }
}

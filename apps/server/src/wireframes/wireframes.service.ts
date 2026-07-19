import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class WireframesService {
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
      const wireframe = await this.prisma.wireframe.findUnique({ where: { id } });

      if (!wireframe) {
        throw new NotFoundException(`Wireframe ${id} not found`);
      }

      if (wireframe.projectId !== projectId) {
        throw new BadRequestException(
          `Wireframe ${id} does not belong to project ${projectId}`,
        );
      }

      return this.prisma.wireframe.update({
        where: { id },
        data: { title, content },
      });
    }

    return this.prisma.wireframe.create({
      data: { projectId, title, content },
    });
  }
}

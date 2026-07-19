import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ArchitecturesService {
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
      const architecture = await this.prisma.architecture.findUnique({
        where: { id },
      });

      if (!architecture) {
        throw new NotFoundException(`Architecture ${id} not found`);
      }

      if (architecture.projectId !== projectId) {
        throw new BadRequestException(
          `Architecture ${id} does not belong to project ${projectId}`,
        );
      }

      return this.prisma.architecture.update({
        where: { id },
        data: { title, content },
      });
    }

    return this.prisma.architecture.create({
      data: { projectId, title, content },
    });
  }
}

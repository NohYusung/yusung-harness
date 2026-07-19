import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class DraftsService {
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
      const draft = await this.prisma.draft.findUnique({ where: { id } });

      if (!draft) {
        throw new NotFoundException(`Draft ${id} not found`);
      }

      if (draft.projectId !== projectId) {
        throw new BadRequestException(
          `Draft ${id} does not belong to project ${projectId}`,
        );
      }

      return this.prisma.draft.update({
        where: { id },
        data: { title, content },
      });
    }

    return this.prisma.draft.create({
      data: { projectId, title, content },
    });
  }
}

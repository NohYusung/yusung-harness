import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ReviewsService {
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
      const review = await this.prisma.review.findUnique({ where: { id } });

      if (!review) {
        throw new NotFoundException(`Review ${id} not found`);
      }

      if (review.projectId !== projectId) {
        throw new BadRequestException(
          `Review ${id} does not belong to project ${projectId}`,
        );
      }

      return this.prisma.review.update({
        where: { id },
        data: { title, content },
      });
    }

    return this.prisma.review.create({
      data: { projectId, title, content },
    });
  }
}

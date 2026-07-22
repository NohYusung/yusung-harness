import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class DraftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 초안을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.draft.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트 draft를 생성하거나 기존 record를 갱신한다. */
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
      const existingDraft = await this.prisma.draft.findUnique({
        where: { id },
      });

      if (!existingDraft) {
        throw new NotFoundException(`Draft ${id} not found`);
      }

      if (existingDraft.projectId !== projectId) {
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

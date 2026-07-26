import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class WorklogsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 작업 내역을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.workLog.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트에 작업 내역을 생성한다. */
  async create({
    projectId,
    title,
    content,
  }: {
    projectId: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.workLog.create({
      data: { projectId, title, content },
    });
  }
}

import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class WireframesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 wireframe을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.wireframe.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트에 속한 wireframe을 생성한다. */
  async create({
    projectId,
    title,
    html,
  }: {
    projectId: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.wireframe.create({
      data: { projectId, title, html },
    });
  }
}

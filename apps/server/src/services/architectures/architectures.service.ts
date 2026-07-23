import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import { deploymentArchitectureSchema } from "./deployment-architecture";

@Injectable()
export class ArchitecturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 배포 Architecture를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.architecture.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 구조화된 배포 Architecture를 생성한다. */
  async create({
    projectId,
    title,
    diagram,
  }: {
    projectId: number;
    title: string;
    diagram: unknown;
  }) {
    await this.projectsService.ensureProject(projectId);
    const content = JSON.stringify(deploymentArchitectureSchema.parse(diagram));

    return this.prisma.architecture.create({
      data: { projectId, title, content },
    });
  }
}

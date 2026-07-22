import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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

  /** 구조화된 배포 Architecture를 생성하거나 기존 record를 갱신한다. */
  async save({
    projectId,
    id,
    title,
    diagram,
  }: {
    projectId: number;
    id?: number;
    title: string;
    diagram: unknown;
  }) {
    await this.projectsService.ensureProject(projectId);
    const content = JSON.stringify(deploymentArchitectureSchema.parse(diagram));

    if (id) {
      const existingArchitecture = await this.prisma.architecture.findUnique({
        where: { id },
      });

      if (!existingArchitecture) {
        throw new NotFoundException(`Architecture ${id} not found`);
      }

      if (existingArchitecture.projectId !== projectId) {
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

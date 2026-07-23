import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 Domain 분석 문서를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.domain.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 에이전트가 분석한 프로젝트 codebase의 Domain 문서를 생성한다. */
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

    return this.prisma.domain.create({
      data: { projectId, title, content },
    });
  }

  /** 같은 프로젝트가 소유한 Domain 분석 문서의 제목과 내용을 갱신한다. */
  async update({
    projectId,
    domainId,
    title,
    content,
  }: {
    projectId: number;
    domainId: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingDomain = await this.prisma.domain.findUnique({
      where: { id: domainId },
    });

    if (!existingDomain) {
      throw new NotFoundException(`Domain ${domainId} not found`);
    }

    if (existingDomain.projectId !== projectId) {
      throw new BadRequestException(
        `Domain ${domainId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.domain.update({
      where: { id: domainId },
      data: { title, content },
    });
  }
}

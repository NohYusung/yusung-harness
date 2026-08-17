import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ResearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 Research 문서를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.research.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 비어 있지 않은 제목과 본문으로 Research 문서를 생성한다. */
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
    this.assertNonEmpty({ title, content });

    return this.prisma.research.create({
      data: { projectId, title, content },
    });
  }

  /** 같은 프로젝트가 소유한 Research의 제목과 본문만 수정한다. */
  async update({
    projectId,
    researchId,
    title,
    content,
  }: {
    projectId: number;
    researchId: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    this.assertNonEmpty({ title, content });
    const research = await this.prisma.research.findUnique({
      where: { id: researchId },
    });

    if (!research) {
      throw new NotFoundException(`Research ${researchId} not found`);
    }

    if (research.projectId !== projectId) {
      throw new BadRequestException(
        `Research ${researchId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.research.update({
      where: { id: researchId },
      data: { title, content },
    });
  }

  /** Research의 필수 문자열이 공백만 포함하지 않는지 검증한다. */
  private assertNonEmpty({
    title,
    content,
  }: {
    title: string;
    content: string;
  }): void {
    if (!title.trim() || !content.trim()) {
      throw new BadRequestException(
        "Research title and content must not be empty",
      );
    }
  }
}

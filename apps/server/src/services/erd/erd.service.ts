import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

/** 프로젝트의 ERD 문서 use case를 처리한다. */
@Injectable()
export class ErdService {
  /** ERD 문서 저장소와 프로젝트 경계 검증을 연결한다. */
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 현행 DB ERD를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.eRD.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트의 현행 DB ERD를 HTML 문서로 생성한다. */
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

    return this.prisma.eRD.create({
      data: { projectId, title, html },
    });
  }

  /** 같은 프로젝트가 소유한 ERD의 제목과 HTML을 갱신한다. */
  async update({
    projectId,
    erdId,
    title,
    html,
  }: {
    projectId: number;
    erdId: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingErd = await this.prisma.eRD.findUnique({
      where: { id: erdId },
    });

    /** 수정할 ERD 문서의 존재를 검증한다. */
    if (!existingErd) {
      throw new NotFoundException(`ERD ${erdId} not found`);
    }

    /** 다른 프로젝트의 ERD 문서 수정을 차단한다. */
    if (existingErd.projectId !== projectId) {
      throw new BadRequestException(
        `ERD ${erdId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.eRD.update({
      where: { id: erdId },
      data: { title, html },
    });
  }
}

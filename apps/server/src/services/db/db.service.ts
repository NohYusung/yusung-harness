import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

/** 프로젝트의 DB 스키마 문서 use case를 처리한다. */
@Injectable()
export class DbService {
  /** DB 문서 저장소와 프로젝트 경계 검증을 연결한다. */
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 현행 DB 스키마 문서를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.dB.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트의 현행 DB 스키마를 테이블 단위 Markdown 문서로 생성한다. */
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

    return this.prisma.dB.create({
      data: { projectId, title, content },
    });
  }

  /** 같은 프로젝트가 소유한 DB 스키마 문서의 제목과 내용을 갱신한다. */
  async update({
    projectId,
    dbId,
    title,
    content,
  }: {
    projectId: number;
    dbId: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingDb = await this.prisma.dB.findUnique({
      where: { id: dbId },
    });

    /** 수정할 DB 문서의 존재를 검증한다. */
    if (!existingDb) {
      throw new NotFoundException(`DB ${dbId} not found`);
    }

    /** 다른 프로젝트의 DB 문서 수정을 차단한다. */
    if (existingDb.projectId !== projectId) {
      throw new BadRequestException(
        `DB ${dbId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.dB.update({
      where: { id: dbId },
      data: { title, content },
    });
  }
}

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";
import {
  canonicalizeExcalidrawScene,
  type ExcalidrawSceneInput,
} from "./excalidraw-scene";

/** legacyHtml을 제외한 ERD 공개 응답 필드를 한곳에서 고정한다. */
const publicErdSelect = {
  id: true,
  projectId: true,
  createdAt: true,
  updatedAt: true,
  title: true,
  scene: true,
} as const;

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
      select: publicErdSelect,
    });
  }

  /** 프로젝트의 현행 DB ERD를 canonical Excalidraw scene으로 생성한다. */
  async create({
    projectId,
    title,
    scene,
  }: {
    projectId: number;
    title: string;
    scene: ExcalidrawSceneInput;
  }) {
    await this.projectsService.ensureProject(projectId);
    const canonicalScene = canonicalizeExcalidrawScene(scene);

    return this.prisma.eRD.create({
      data: { projectId, title, scene: canonicalScene },
      select: publicErdSelect,
    });
  }

  /** 같은 프로젝트가 소유한 ERD의 제목과 Excalidraw scene을 갱신한다. */
  async update({
    projectId,
    erdId,
    title,
    scene,
  }: {
    projectId: number;
    erdId: number;
    title: string;
    scene: ExcalidrawSceneInput;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingErd = await this.prisma.eRD.findUnique({
      where: { id: erdId },
      select: { id: true, projectId: true },
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

    const canonicalScene = canonicalizeExcalidrawScene(scene);

    return this.prisma.eRD.update({
      where: { id: erdId },
      data: { title, scene: canonicalScene },
      select: publicErdSelect,
    });
  }
}

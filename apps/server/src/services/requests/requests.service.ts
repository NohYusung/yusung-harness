import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { RequestStatus } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 작업 요청을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.request.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트에 기본 PENDING 상태의 작업 요청을 생성한다. */
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

    return this.prisma.request.create({
      data: { projectId, title, content },
    });
  }

  /** 같은 프로젝트가 소유한 작업 요청의 내용과 상태를 갱신한다. */
  async update({
    projectId,
    requestId,
    title,
    content,
    status,
  }: {
    projectId: number;
    requestId: number;
    title: string;
    content: string;
    status: RequestStatus;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingRequest = await this.prisma.request.findUnique({
      where: { id: requestId },
    });

    if (!existingRequest) {
      throw new NotFoundException(`Request ${requestId} not found`);
    }

    if (existingRequest.projectId !== projectId) {
      throw new BadRequestException(
        `Request ${requestId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.request.update({
      where: { id: requestId },
      data: { title, content, status },
    });
  }
}

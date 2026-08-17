import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { RepoType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateProjectInput {
  title: string;
  repoPaths: Array<{
    path: string;
    repoType: RepoType;
  }>;
  description: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const projects = await this.prisma.project.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        repoPaths: {
          select: { path: true, repoType: true },
          orderBy: [{ path: "asc" }, { id: "asc" }],
        },
        _count: {
          select: {
            plans: true,
            tasks: true,
            drafts: true,
            domains: true,
            architectures: true,
            wireframes: true,
            assets: true,
            designs: true,
            reviews: true,
            requests: true,
            workLogs: true,
            databases: true,
            erds: true,
          },
        },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });

    /** PLAN·PRODUCTION 물리 행을 Architecture workspace 하나의 논리 count로 정규화한다. */
    return projects.map((project) => ({
      ...project,
      _count: {
        ...project._count,
        architectures: project._count.architectures > 0 ? 1 : 0,
      },
    }));
  }

  /** 하나 이상의 repository 경로를 포함한 프로젝트를 생성한다. */
  async create({ title, repoPaths, description }: CreateProjectInput) {
    if (repoPaths.length === 0) {
      throw new BadRequestException(
        "Project requires at least one repository",
      );
    }

    return this.prisma.project.create({
      data: {
        title,
        description,
        repoPaths: { create: repoPaths },
      },
      include: {
        repoPaths: {
          select: { path: true, repoType: true },
          orderBy: [{ path: "asc" }, { id: "asc" }],
        },
      },
    });
  }

  /** project 소유권 검증에 사용하는 존재 여부 조회. */
  async ensureProject(projectId: number): Promise<void> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException(`Project ${projectId} not found`);
    }
  }
}

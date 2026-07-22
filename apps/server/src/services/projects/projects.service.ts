import { Injectable, NotFoundException } from "@nestjs/common";
import { RepoType } from "../../generated/prisma/enums";
import { PrismaService } from "../../prisma/prisma.service";

export interface CreateProjectInput {
  title: string;
  repoPath: string;
  repoType: RepoType;
  description: string;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.project.findMany({
      select: {
        id: true,
        title: true,
        repoPath: true,
        repoType: true,
        description: true,
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
          },
        },
      },
      orderBy: [{ title: "asc" }, { id: "asc" }],
    });
  }

  /** repository 경로와 유형을 포함한 프로젝트를 생성한다. */
  async create({ title, repoPath, repoType, description }: CreateProjectInput) {
    return this.prisma.project.create({
      data: { title, repoPath, repoType, description },
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

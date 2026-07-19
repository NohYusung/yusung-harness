import { Injectable, NotFoundException } from "@nestjs/common";
import { RepoType } from "../generated/prisma/enums";
import { PrismaService } from "../prisma/prisma.service";

export interface UpsertProjectInput {
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

  upsert({ title, repoPath, repoType, description }: UpsertProjectInput) {
    return this.prisma.project.upsert({
      where: {
        repoPath_repoType: { repoPath, repoType },
      },
      update: { title, description },
      create: { title, repoPath, repoType, description },
    });
  }

  async getContext(projectId: number) {
    await this.ensureProject(projectId);

    return this.prisma.project.findUniqueOrThrow({
      where: { id: projectId },
      include: {
        plans: {
          orderBy: { version: "desc" },
          include: { tasks: { orderBy: { createdAt: "asc" } } },
        },
        tasks: { orderBy: { updatedAt: "desc" } },
        drafts: { orderBy: { updatedAt: "desc" } },
        architectures: { orderBy: { updatedAt: "desc" } },
        wireframes: { orderBy: { updatedAt: "desc" } },
        assets: { orderBy: { updatedAt: "desc" } },
        designs: {
          orderBy: { updatedAt: "desc" },
          include: { wireframe: true, asset: true },
        },
        reviews: { orderBy: { updatedAt: "desc" } },
      },
    });
  }

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

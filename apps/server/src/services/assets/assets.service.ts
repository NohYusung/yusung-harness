import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 asset을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.asset.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트에 속한 asset을 생성한다. */
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

    return this.prisma.asset.create({
      data: { projectId, title, html },
    });
  }

  /** 같은 프로젝트가 소유한 asset의 제목과 HTML을 갱신한다. */
  async update({
    projectId,
    assetId,
    title,
    html,
  }: {
    projectId: number;
    assetId: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingAsset = await this.prisma.asset.findUnique({
      where: { id: assetId },
    });

    if (!existingAsset) {
      throw new NotFoundException(`Asset ${assetId} not found`);
    }

    if (existingAsset.projectId !== projectId) {
      throw new BadRequestException(
        `Asset ${assetId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.asset.update({
      where: { id: assetId },
      data: { title, html },
    });
  }
}

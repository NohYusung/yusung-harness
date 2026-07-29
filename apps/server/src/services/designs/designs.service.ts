import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { z } from "zod/v4";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

/** Design create 경계에서 허용할 explicit version 형식. */
const designVersionSchema = z.number().int().positive();

@Injectable()
export class DesignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 디자인을 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.design.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      include: { wireframe: true, asset: true },
    });
  }

  /** 관련 산출물 검증과 design 생성을 하나의 transaction으로 처리한다. */
  async create({
    projectId,
    wireframeId,
    assetId,
    title,
    html,
    version,
  }: {
    projectId: number;
    wireframeId: number;
    assetId: number;
    title: string;
    html: string;
    version: number;
  }) {
    await this.projectsService.ensureProject(projectId);
    const parsedVersion = this.parseVersion(version);

    return this.prisma.$transaction(async (transaction) => {
      const [wireframe, asset] = await Promise.all([
        transaction.wireframe.findUnique({ where: { id: wireframeId } }),
        transaction.asset.findUnique({ where: { id: assetId } }),
      ]);

      this.assertRelatedProject(
        wireframe,
        projectId,
        "Wireframe",
        wireframeId,
      );
      this.assertRelatedProject(asset, projectId, "Asset", assetId);

      return transaction.design.create({
        data: {
          projectId,
          wireframeId,
          assetId,
          title,
          html,
          version: parsedVersion,
        },
      });
    });
  }

  /** 같은 프로젝트가 소유한 design의 제목과 HTML을 갱신한다. */
  async update({
    projectId,
    designId,
    title,
    html,
  }: {
    projectId: number;
    designId: number;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingDesign = await this.prisma.design.findUnique({
      where: { id: designId },
    });

    if (!existingDesign) {
      throw new NotFoundException(`Design ${designId} not found`);
    }

    if (existingDesign.projectId !== projectId) {
      throw new BadRequestException(
        `Design ${designId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.design.update({
      where: { id: designId },
      data: { title, html },
    });
  }

  /** Design version을 누락 없는 양의 정수로 제한한다. */
  private parseVersion(version: number): number {
    const parsed = designVersionSchema.safeParse(version);

    /** create 경계 밖의 직접 호출도 동일한 version 계약으로 거부한다. */
    if (!parsed.success) {
      throw new BadRequestException(
        "Design version must be a positive integer",
      );
    }

    return parsed.data;
  }

  /** 관련 산출물이 요청한 프로젝트에 속하는지 검증한다. */
  private assertRelatedProject(
    record: { projectId: number } | null,
    projectId: number,
    label: string,
    id: number,
  ): asserts record is { projectId: number } {
    if (!record) {
      throw new NotFoundException(`${label} ${id} not found`);
    }

    if (record.projectId !== projectId) {
      throw new BadRequestException(
        `${label} ${id} does not belong to project ${projectId}`,
      );
    }
  }
}

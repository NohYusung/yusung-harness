import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { z } from "zod/v4";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

const wireframeIndexSchema = z
  .string()
  .trim()
  .max(255)
  .regex(/^[1-9]\d*(?:\.[1-9]\d*)*$/);

interface WireframeJourneyRecord {
  id: number;
  index: string;
}

/** 계층 index를 자연수 segment 단위로 비교하고 동일하면 id로 정렬한다. */
function compareWireframeJourney(
  left: WireframeJourneyRecord,
  right: WireframeJourneyRecord,
): number {
  const leftSegments = left.index.split(".").map(BigInt);
  const rightSegments = right.index.split(".").map(BigInt);
  const commonLength = Math.min(leftSegments.length, rightSegments.length);

  for (let position = 0; position < commonLength; position += 1) {
    const leftSegment = leftSegments[position];
    const rightSegment = rightSegments[position];

    if (leftSegment < rightSegment) {
      return -1;
    }
    if (leftSegment > rightSegment) {
      return 1;
    }
  }

  if (leftSegments.length !== rightSegments.length) {
    return leftSegments.length - rightSegments.length;
  }

  return left.id - right.id;
}

@Injectable()
export class WireframesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 wireframe을 계층형 사용자 여정 순서로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);
    const wireframes = await this.prisma.wireframe.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });

    return [...wireframes].sort(compareWireframeJourney);
  }

  /** 프로젝트에 root 또는 direct-child wireframe을 생성한다. */
  async create({
    projectId,
    parentId,
    index,
    title,
    html,
  }: {
    projectId: number;
    parentId: number | null;
    index: string;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.$transaction(async (transaction) => {
      const parsedIndex = this.parseIndex(index);
      const parent = await this.validateParent({
        transaction,
        projectId,
        parentId,
      });
      this.validateJourneyPath(parent, parsedIndex);

      return transaction.wireframe.create({
        data: { projectId, parentId, index: parsedIndex, title, html },
      });
    });
  }

  /** leaf wireframe의 구조 또는 기존 wireframe의 제목과 HTML을 갱신한다. */
  async update({
    projectId,
    wireframeId,
    parentId,
    index,
    title,
    html,
  }: {
    projectId: number;
    wireframeId: number;
    parentId: number | null;
    index: string;
    title: string;
    html: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.$transaction(async (transaction) => {
      const existingWireframe = await transaction.wireframe.findUnique({
        where: { id: wireframeId },
      });

      /** 존재하지 않는 wireframe은 update 대상이 될 수 없다. */
      if (!existingWireframe) {
        throw new NotFoundException(`Wireframe ${wireframeId} not found`);
      }

      /** 다른 프로젝트의 wireframe을 교차 갱신하지 못하게 소유권을 검증한다. */
      if (existingWireframe.projectId !== projectId) {
        throw new BadRequestException(
          `Wireframe ${wireframeId} does not belong to project ${projectId}`,
        );
      }

      const parsedIndex = this.parseIndex(index);
      const parent = await this.validateParent({
        transaction,
        projectId,
        parentId,
        wireframeId,
      });
      this.validateJourneyPath(parent, parsedIndex);

      const structureChanged =
        existingWireframe.parentId !== parentId ||
        existingWireframe.index !== parsedIndex;

      /** 자식의 path가 암묵적으로 바뀌는 branch 구조 변경은 거부한다. */
      if (structureChanged) {
        const childCount = await transaction.wireframe.count({
          where: { parentId: wireframeId },
        });

        if (childCount > 0) {
          throw new BadRequestException(
            `Wireframe ${wireframeId} has children and cannot be moved`,
          );
        }
      }

      return transaction.wireframe.update({
        where: { id: wireframeId },
        data: { parentId, index: parsedIndex, title, html },
      });
    });
  }

  /** 외부 입력 index를 정규화하고 계층 path 형식을 검증한다. */
  private parseIndex(index: string): string {
    const parsed = wireframeIndexSchema.safeParse(index);

    if (!parsed.success) {
      throw new BadRequestException(
        "Wireframe index must be a hierarchical positive-integer path",
      );
    }

    return parsed.data;
  }

  /** 부모의 존재, 소유권, self/cycle 관계를 transaction 안에서 검증한다. */
  private async validateParent({
    transaction,
    projectId,
    parentId,
    wireframeId,
  }: {
    transaction: Prisma.TransactionClient;
    projectId: number;
    parentId: number | null;
    wireframeId?: number;
  }) {
    if (parentId === null) {
      return null;
    }

    if (!Number.isInteger(parentId) || parentId <= 0) {
      throw new BadRequestException("Wireframe parentId must be positive");
    }

    if (wireframeId === parentId) {
      throw new BadRequestException("A Wireframe cannot be its own parent");
    }

    const parent = await transaction.wireframe.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException(`Wireframe parent ${parentId} not found`);
    }

    if (parent.projectId !== projectId) {
      throw new BadRequestException(
        `Wireframe parent ${parentId} does not belong to project ${projectId}`,
      );
    }

    /** 새 부모의 조상에 대상이 포함되면 순환 관계가 되므로 거부한다. */
    if (wireframeId !== undefined) {
      let ancestor = parent;
      const visited = new Set<number>();

      while (true) {
        if (ancestor.id === wireframeId) {
          throw new BadRequestException("Wireframe hierarchy cannot be cyclic");
        }
        if (visited.has(ancestor.id)) {
          throw new BadRequestException("Wireframe hierarchy is already cyclic");
        }
        visited.add(ancestor.id);

        if (ancestor.parentId === null) {
          break;
        }

        const nextAncestor = await transaction.wireframe.findUnique({
          where: { id: ancestor.parentId },
        });

        if (!nextAncestor || nextAncestor.projectId !== projectId) {
          throw new BadRequestException(
            "Wireframe parent hierarchy is invalid",
          );
        }
        ancestor = nextAncestor;
      }
    }

    return parent;
  }

  /** root는 한 segment, child는 부모 path에 한 segment만 추가하도록 검증한다. */
  private validateJourneyPath(
    parent: { index: string } | null,
    index: string,
  ): void {
    if (!parent) {
      if (index.includes(".")) {
        throw new BadRequestException(
          "A root Wireframe index must have one segment",
        );
      }
      return;
    }

    const parentSegments = parent.index.split(".");
    const childSegments = index.split(".");
    const isDirectChild =
      childSegments.length === parentSegments.length + 1 &&
      parentSegments.every(
        (segment, position) => childSegments[position] === segment,
      );

    if (!isDirectChild) {
      throw new BadRequestException(
        "A child Wireframe index must extend its parent by one segment",
      );
    }
  }
}

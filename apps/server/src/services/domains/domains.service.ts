import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

/** 이전 Domain ERD v1 snapshot을 Markdown 페이지 입력과 구분한다. */
function isDomainErdPayload(content: string): boolean {
  try {
    const parsed: unknown = JSON.parse(content);

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return false;
    }

    const candidate = parsed as Record<string, unknown>;
    return (
      candidate.kind === "domain-erd" &&
      candidate.schemaVersion === 1 &&
      Array.isArray(candidate.entities) &&
      Array.isArray(candidate.relationships)
    );
  } catch {
    return false;
  }
}

@Injectable()
export class DomainsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** 프로젝트의 Markdown 비즈니스 Domain 페이지를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.domain.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** 프로젝트에 root 또는 child Markdown 비즈니스 Domain 페이지를 생성한다. */
  async create({
    projectId,
    parentId = null,
    title,
    content,
  }: {
    projectId: number;
    parentId?: number | null;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const normalizedTitle = this.normalizeTitle(title);
        this.assertMarkdownContent(content);
        await this.ensureUniqueTitle({
          transaction,
          projectId,
          title: normalizedTitle,
        });
        await this.validateParent({ transaction, projectId, parentId });

        return transaction.domain.create({
          data: {
            projectId,
            parentId,
            title: normalizedTitle,
            content,
          },
        });
      });
    } catch (error: unknown) {
      this.rethrowUniqueTitleConflict(error, projectId, title.trim());
    }
  }

  /** 같은 프로젝트의 Markdown Domain 페이지와 선택적 부모 관계를 갱신한다. */
  async update({
    projectId,
    domainId,
    parentId,
    title,
    content,
  }: {
    projectId: number;
    domainId: number;
    parentId?: number | null;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    try {
      return await this.prisma.$transaction(async (transaction) => {
        const existingDomain = await transaction.domain.findUnique({
          where: { id: domainId },
        });

        if (!existingDomain) {
          throw new NotFoundException(`Domain ${domainId} not found`);
        }

        if (existingDomain.projectId !== projectId) {
          throw new BadRequestException(
            `Domain ${domainId} does not belong to project ${projectId}`,
          );
        }

        const normalizedTitle = this.normalizeTitle(title);
        this.assertMarkdownContent(content);
        const nextParentId =
          parentId === undefined ? existingDomain.parentId : parentId;
        await this.ensureUniqueTitle({
          transaction,
          projectId,
          title: normalizedTitle,
          domainId,
        });
        await this.validateParent({
          transaction,
          projectId,
          parentId: nextParentId,
          domainId,
        });

        return transaction.domain.update({
          where: { id: domainId },
          data: {
            parentId: nextParentId,
            title: normalizedTitle,
            content,
          },
        });
      });
    } catch (error: unknown) {
      this.rethrowUniqueTitleConflict(error, projectId, title.trim());
    }
  }

  /** Domain 제목을 저장 기준으로 정규화하고 빈 제목을 거부한다. */
  private normalizeTitle(title: string): string {
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      throw new BadRequestException("Domain title is required");
    }

    return normalizedTitle;
  }

  /** 구조화 ERD snapshot이 Domain Markdown 페이지로 다시 저장되지 않게 차단한다. */
  private assertMarkdownContent(content: string): void {
    if (isDomainErdPayload(content)) {
      throw new BadRequestException(
        "Domain content must be Markdown, not a domain-erd snapshot",
      );
    }
  }

  /** 프로젝트 안에서 다른 Domain이 같은 정규화 제목을 사용하지 않는지 확인한다. */
  private async ensureUniqueTitle({
    transaction,
    projectId,
    title,
    domainId,
  }: {
    transaction: Prisma.TransactionClient;
    projectId: number;
    title: string;
    domainId?: number;
  }): Promise<void> {
    const duplicate = await transaction.domain.findFirst({
      where: {
        projectId,
        title,
        ...(domainId === undefined ? {} : { id: { not: domainId } }),
      },
      select: { id: true },
    });

    if (duplicate) {
      throw new ConflictException(
        `Domain title "${title}" already exists in project ${projectId}`,
      );
    }
  }

  /** 부모의 존재·소유권과 resulting ancestor chain의 self/descendant/cycle을 검증한다. */
  private async validateParent({
    transaction,
    projectId,
    parentId,
    domainId,
  }: {
    transaction: Prisma.TransactionClient;
    projectId: number;
    parentId: number | null;
    domainId?: number;
  }): Promise<void> {
    if (parentId === null) {
      return;
    }

    if (!Number.isInteger(parentId) || parentId <= 0) {
      throw new BadRequestException("Domain parentId must be positive");
    }

    if (domainId === parentId) {
      throw new BadRequestException("A Domain cannot be its own parent");
    }

    const parent = await transaction.domain.findUnique({
      where: { id: parentId },
    });

    if (!parent) {
      throw new NotFoundException(`Domain parent ${parentId} not found`);
    }

    if (parent.projectId !== projectId) {
      throw new BadRequestException(
        `Domain parent ${parentId} does not belong to project ${projectId}`,
      );
    }

    let ancestor = parent;
    const visited = new Set<number>();

    while (true) {
      if (domainId !== undefined && ancestor.id === domainId) {
        throw new BadRequestException(
          `Domain ${domainId} cannot be moved below its descendant`,
        );
      }

      if (visited.has(ancestor.id)) {
        throw new BadRequestException("Domain hierarchy is already cyclic");
      }
      visited.add(ancestor.id);

      if (ancestor.parentId === null) {
        return;
      }

      const nextAncestor = await transaction.domain.findUnique({
        where: { id: ancestor.parentId },
      });

      if (!nextAncestor || nextAncestor.projectId !== projectId) {
        throw new BadRequestException("Domain parent hierarchy is invalid");
      }
      ancestor = nextAncestor;
    }
  }

  /** DB unique race를 사전 조회와 같은 409 Domain 오류로 변환한다. */
  private rethrowUniqueTitleConflict(
    error: unknown,
    projectId: number,
    title: string,
  ): never {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      error.code === "P2002"
    ) {
      throw new ConflictException(
        `Domain title "${title}" already exists in project ${projectId}`,
      );
    }

    throw error;
  }
}

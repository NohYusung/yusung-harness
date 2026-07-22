import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { PlansService } from "../plans/plans.service";
import { ProjectsService } from "../projects/projects.service";

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
    private readonly plansService: PlansService,
  ) {}

  /** 프로젝트의 리뷰를 최근 수정순으로 조회한다. */
  async list({ projectId }: { projectId: number }) {
    await this.projectsService.ensureProject(projectId);

    return this.prisma.review.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
    });
  }

  /** plan에 연결된 review를 생성하거나 기존 record를 갱신한다. */
  async save({
    projectId,
    planId,
    id,
    title,
    content,
  }: {
    projectId: number;
    planId: number;
    id?: number;
    title: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    await this.plansService.ensurePlan(projectId, planId);

    if (id) {
      const existingReview = await this.prisma.review.findUnique({
        where: { id },
      });

      if (!existingReview) {
        throw new NotFoundException(`Review ${id} not found`);
      }

      if (existingReview.projectId !== projectId) {
        throw new BadRequestException(
          `Review ${id} does not belong to project ${projectId}`,
        );
      }

      return this.prisma.review.update({
        where: { id },
        data: { planId, title, content },
      });
    }

    return this.prisma.review.create({
      data: { projectId, planId, title, content },
    });
  }
}

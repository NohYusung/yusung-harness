import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ReviewsService } from "./reviews.service";

@Controller("reviews/:projectId")
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  /**
   * 프로젝트 리뷰 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.reviewsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

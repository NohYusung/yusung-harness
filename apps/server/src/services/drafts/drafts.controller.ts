import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { DraftsService } from "./drafts.service";

@Controller("drafts/:projectId")
export class DraftsController {
  constructor(private readonly draftsService: DraftsService) {}

  /**
   * 프로젝트 초안 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.draftsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

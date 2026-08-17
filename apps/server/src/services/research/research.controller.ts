import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ResearchService } from "./research.service";

@Controller("research/:projectId")
export class ResearchController {
  constructor(private readonly researchService: ResearchService) {}

  /**
   * 프로젝트 Research 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.researchService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

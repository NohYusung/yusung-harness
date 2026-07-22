import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { DesignsService } from "./designs.service";

@Controller("designs/:projectId")
export class DesignsController {
  constructor(private readonly designsService: DesignsService) {}

  /**
   * 프로젝트 디자인 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.designsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

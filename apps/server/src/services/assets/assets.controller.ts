import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { AssetsService } from "./assets.service";

@Controller("assets/:projectId")
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  /**
   * 프로젝트 에셋 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.assetsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { WireframesService } from "./wireframes.service";

@Controller("wireframes/:projectId")
export class WireframesController {
  constructor(private readonly wireframesService: WireframesService) {}

  /**
   * 프로젝트 와이어프레임 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.wireframesService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

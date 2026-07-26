import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ArchitecturePlansService } from "./architecture-plans.service";

@Controller("architecture-plans/:projectId")
export class ArchitecturePlansController {
  constructor(
    private readonly architecturePlansService: ArchitecturePlansService,
  ) {}

  /**
   * 프로젝트 아키텍처 설계 계획 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.architecturePlansService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

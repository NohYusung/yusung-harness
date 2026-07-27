import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { PlansService } from "./plans.service";

@Controller("plans/:projectId")
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * 프로젝트 계획 목록 조회
   */
  @Get()
  async list(@Param("projectId", ParseIntPipe) projectId: number) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.plansService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

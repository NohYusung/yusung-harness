import {
  Controller,
  Get,
  Param,
  ParseEnumPipe,
  ParseIntPipe,
  Query,
} from "@nestjs/common";
import { PlansService } from "./plans.service";

/** HTTP caller가 선택할 수 있는 Plan version 정렬 방향. */
enum PlanVersionOrder {
  ASC = "asc",
  DESC = "desc",
}

@Controller("plans/:projectId")
export class PlansController {
  constructor(private readonly plansService: PlansService) {}

  /**
   * 프로젝트 계획 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
    @Query(
      "versionOrder",
      new ParseEnumPipe(PlanVersionOrder, { optional: true }),
    )
    versionOrder?: PlanVersionOrder,
  ) {
    // 1. Destructure body, params, query
    const options = versionOrder
      ? { orderBy: { version: versionOrder } }
      : undefined;

    // 2. Get context

    // 3. Get result
    const data = await this.plansService.list({ projectId }, options);

    // 4. Send response
    return { data };
  }
}

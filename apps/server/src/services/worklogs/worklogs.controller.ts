import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { WorklogsService } from "./worklogs.service";

@Controller("worklogs/:projectId")
export class WorklogsController {
  constructor(private readonly worklogsService: WorklogsService) {}

  /**
   * 프로젝트 작업 내역 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.worklogsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { RequestsService } from "./requests.service";

@Controller("requests/:projectId")
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  /**
   * 프로젝트 작업 요청 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.requestsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

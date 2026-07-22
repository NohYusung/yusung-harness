import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ArchitecturesService } from "./architectures.service";

@Controller("architectures/:projectId")
export class ArchitecturesController {
  constructor(private readonly architecturesService: ArchitecturesService) {}

  /**
   * 프로젝트 배포 Architecture 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.architecturesService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

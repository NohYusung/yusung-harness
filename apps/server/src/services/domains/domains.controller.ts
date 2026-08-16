import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { DomainsService } from "./domains.service";

@Controller("domains/:projectId")
export class DomainsController {
  constructor(private readonly domainsService: DomainsService) {}

  /**
   * 프로젝트의 계층형 비즈니스 Domain Markdown 페이지 목록 조회
   */
  @Get()
  async list(@Param("projectId", ParseIntPipe) projectId: number) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.domainsService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { ErdService } from "./erd.service";

/** 프로젝트 ERD 문서 조회 API를 제공한다. */
@Controller("erd/:projectId")
export class ErdController {
  /** ERD 문서 use case를 HTTP handler에 연결한다. */
  constructor(private readonly erdService: ErdService) {}

  /**
   * 프로젝트 ERD 목록 조회
   */
  @Get()
  async list(@Param("projectId", ParseIntPipe) projectId: number) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.erdService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

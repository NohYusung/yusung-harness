import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { DbService } from "./db.service";

/** 프로젝트 DB 스키마 문서 조회 API를 제공한다. */
@Controller("db/:projectId")
export class DbController {
  /** DB 문서 use case를 HTTP handler에 연결한다. */
  constructor(private readonly dbService: DbService) {}

  /**
   * 프로젝트 DB 스키마 문서 목록 조회
   */
  @Get()
  async list(@Param("projectId", ParseIntPipe) projectId: number) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.dbService.list({ projectId });

    // 4. Send response
    return { data };
  }
}

import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
} from "@nestjs/common";
import type { RequestStatus } from "@prisma/client";
import { RequestsService } from "./requests.service";

@Controller("requests/:projectId")
export class RequestsController {
  constructor(private readonly requestsService: RequestsService) {}

  /**
   * 프로젝트 작업 요청 목록 조회
   */
  @Get()
  async list(@Param("projectId", ParseIntPipe) projectId: number) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.requestsService.list({ projectId });

    // 4. Send response
    return { data };
  }

  /**
   * 프로젝트 작업 요청 생성
   */
  @Post()
  async create(
    @Param("projectId", ParseIntPipe) projectId: number,
    @Body() body: { title: string; content: string },
  ) {
    // 1. Destructure body, params, query
    const { title, content } = body;

    // 2. Get context

    // 3. Get result
    const data = await this.requestsService.create({
      projectId,
      title,
      content,
    });

    // 4. Send response
    return { data };
  }

  /**
   * 프로젝트 작업 요청 수정
   */
  @Put(":requestId")
  async update(
    @Param("projectId", ParseIntPipe) projectId: number,
    @Param("requestId", ParseIntPipe) requestId: number,
    @Body()
    body: { title: string; content: string; status: RequestStatus },
  ) {
    // 1. Destructure body, params, query
    const { title, content, status } = body;

    // 2. Get context

    // 3. Get result
    const data = await this.requestsService.userUpdate({
      projectId,
      requestId,
      title,
      content,
      status,
    });

    // 4. Send response
    return { data };
  }
}

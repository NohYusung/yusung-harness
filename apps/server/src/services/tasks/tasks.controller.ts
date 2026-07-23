import { Controller, Get, Param, ParseIntPipe } from "@nestjs/common";
import { TasksService } from "./tasks.service";

@Controller("tasks/:projectId/:planId")
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  /**
   * 프로젝트 계획 작업 목록 조회
   */
  @Get()
  async list(
    @Param("projectId", ParseIntPipe) projectId: number,
    @Param("planId", ParseIntPipe) planId: number,
  ) {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.tasksService.list({ projectId, planId });

    // 4. Send response
    return { data };
  }
}

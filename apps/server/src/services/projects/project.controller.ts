import { Controller, Get } from "@nestjs/common";
import { ProjectsService } from "./projects.service";

@Controller("projects")
export class ProjectController {
  constructor(private readonly projectsService: ProjectsService) {}

  /**
   * 프로젝트 목록 조회
   */
  @Get()
  async list() {
    // 1. Destructure body, params, query

    // 2. Get context

    // 3. Get result
    const data = await this.projectsService.list();

    // 4. Send response
    return { data };
  }
}

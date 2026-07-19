import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from "@nestjs/common";
import { z } from "zod/v4";
import { ProjectsService } from "./projects.service";

const upsertProjectSchema = z.object({
  title: z.string().trim().min(1),
  repoPath: z.string().trim().min(1),
  repoType: z.enum(["LOCAL", "REMOTE"]),
  description: z.string().trim().min(1),
});

@Controller("projects")
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  upsert(@Body() body: unknown) {
    const input = upsertProjectSchema.safeParse(body);

    if (!input.success) {
      throw new BadRequestException(z.prettifyError(input.error));
    }

    return this.projectsService.upsert(input.data);
  }

  @Get()
  list() {
    return this.projectsService.list();
  }

  @Get(":projectId")
  getContext(@Param("projectId", ParseIntPipe) projectId: number) {
    return this.projectsService.getContext(projectId);
  }
}

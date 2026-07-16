import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { ProjectsService } from "./projects.service";
import { Prisma } from "@prisma/client";

@ApiTags("projects")
@Controller("projects")
@ApiBearerAuth()
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Post()
  create(@Body() createProjectDto: Prisma.ProjectCreateInput) {
    return this.projectsService.create(createProjectDto);
  }
}

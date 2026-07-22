import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectController } from "./project.controller";
import { ProjectsService } from "./projects.service";

@Module({
  imports: [PrismaModule],
  controllers: [ProjectController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { TasksService } from "./tasks.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [TasksService],
  exports: [TasksService],
})
export class TasksModule {}

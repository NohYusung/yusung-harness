import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { WorklogsController } from "./worklogs.controller";
import { WorklogsService } from "./worklogs.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [WorklogsController],
  providers: [WorklogsService],
  exports: [WorklogsService],
})
export class WorklogsModule {}

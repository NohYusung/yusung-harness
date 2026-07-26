import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { RequestsController } from "./requests.controller";
import { RequestsService } from "./requests.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [RequestsController],
  providers: [RequestsService],
  exports: [RequestsService],
})
export class RequestsModule {}

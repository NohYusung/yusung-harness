import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { ArchitecturePlansController } from "./architecture-plans.controller";
import { ArchitecturePlansService } from "./architecture-plans.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [ArchitecturePlansController],
  providers: [ArchitecturePlansService],
  exports: [ArchitecturePlansService],
})
export class ArchitecturePlansModule {}

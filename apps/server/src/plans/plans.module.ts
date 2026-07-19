import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { PlansService } from "./plans.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}

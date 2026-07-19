import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { DesignsService } from "./designs.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [DesignsService],
  exports: [DesignsService],
})
export class DesignsModule {}

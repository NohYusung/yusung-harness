import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { DraftsService } from "./drafts.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [DraftsService],
  exports: [DraftsService],
})
export class DraftsModule {}

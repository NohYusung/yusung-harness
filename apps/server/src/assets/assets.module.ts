import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { AssetsService } from "./assets.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [AssetsService],
  exports: [AssetsService],
})
export class AssetsModule {}

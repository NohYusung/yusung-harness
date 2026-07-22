import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { ArchitecturesController } from "./architectures.controller";
import { ArchitecturesService } from "./architectures.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [ArchitecturesController],
  providers: [ArchitecturesService],
  exports: [ArchitecturesService],
})
export class ArchitecturesModule {}

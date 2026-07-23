import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { WireframesController } from "./wireframes.controller";
import { WireframesService } from "./wireframes.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [WireframesController],
  providers: [WireframesService],
  exports: [WireframesService],
})
export class WireframesModule {}

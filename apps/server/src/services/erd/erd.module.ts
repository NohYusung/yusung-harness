import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { ErdController } from "./erd.controller";
import { ErdService } from "./erd.service";

/** ERD 문서 API와 application service를 조립한다. */
@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [ErdController],
  providers: [ErdService],
  exports: [ErdService],
})
export class ErdModule {}

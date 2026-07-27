import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { DbController } from "./db.controller";
import { DbService } from "./db.service";

/** DB 스키마 문서 API와 application service를 조립한다. */
@Module({
  imports: [PrismaModule, ProjectsModule],
  controllers: [DbController],
  providers: [DbService],
  exports: [DbService],
})
export class DbModule {}

import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { FilesService } from "./files.service";

/** MCP 파일 도구에 프로젝트 파일 application service를 제공한다. */
@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}

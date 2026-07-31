import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { ProjectsService } from "../projects/projects.service";

/** 프로젝트 파일의 임시 저장과 원격 업로드 완료 전이를 처리한다. */
@Injectable()
export class FilesService {
  /** 파일 저장소와 프로젝트 경계 검증을 연결한다. */
  constructor(
    private readonly prisma: PrismaService,
    private readonly projectsService: ProjectsService,
  ) {}

  /** Base64 파일을 프로젝트의 임시 바이너리 데이터로 저장한다. */
  async create({
    projectId,
    title,
    mimeType,
    content,
  }: {
    projectId: number;
    title: string;
    mimeType: string;
    content: string;
  }) {
    await this.projectsService.ensureProject(projectId);

    /** MCP의 JSON 문자열을 Prisma Bytes 입력으로 변환한다. */
    const binaryContent = Buffer.from(content, "base64");

    return this.prisma.file.create({
      data: {
        projectId,
        title,
        mimeType,
        size: binaryContent.byteLength,
        content: binaryContent,
        isUploaded: false,
        uploadUrl: null,
      },
    });
  }

  /** 원격 업로드를 마친 파일의 임시 바이너리를 비우고 URL을 기록한다. */
  async update({
    projectId,
    fileId,
    uploadUrl,
  }: {
    projectId: number;
    fileId: number;
    uploadUrl: string;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingFile = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    /** 업로드 완료 상태로 전환할 파일의 존재를 검증한다. */
    if (!existingFile) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    /** 다른 프로젝트가 소유한 파일의 상태 변경을 차단한다. */
    if (existingFile.projectId !== projectId) {
      throw new BadRequestException(
        `File ${fileId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.file.update({
      where: { id: fileId },
      data: { content: null, isUploaded: true, uploadUrl },
    });
  }

  /** 같은 프로젝트가 소유한 파일 레코드를 삭제한다. */
  async delete({
    projectId,
    fileId,
  }: {
    projectId: number;
    fileId: number;
  }) {
    await this.projectsService.ensureProject(projectId);
    const existingFile = await this.prisma.file.findUnique({
      where: { id: fileId },
    });

    /** 삭제할 파일의 존재를 검증한다. */
    if (!existingFile) {
      throw new NotFoundException(`File ${fileId} not found`);
    }

    /** 다른 프로젝트가 소유한 파일 삭제를 차단한다. */
    if (existingFile.projectId !== projectId) {
      throw new BadRequestException(
        `File ${fileId} does not belong to project ${projectId}`,
      );
    }

    return this.prisma.file.delete({ where: { id: fileId } });
  }
}

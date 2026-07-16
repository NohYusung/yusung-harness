import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

@Module({
  provider: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}

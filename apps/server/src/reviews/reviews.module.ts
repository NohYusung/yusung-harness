import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ProjectsModule } from "../projects/projects.module";
import { ReviewsService } from "./reviews.service";

@Module({
  imports: [PrismaModule, ProjectsModule],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}

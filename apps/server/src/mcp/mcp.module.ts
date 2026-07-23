import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { ArchitecturesModule } from "../services/architectures/architectures.module";
import { AssetsModule } from "../services/assets/assets.module";
import { DesignsModule } from "../services/designs/designs.module";
import { DomainsModule } from "../services/domains/domains.module";
import { DraftsModule } from "../services/drafts/drafts.module";
import { PlansModule } from "../services/plans/plans.module";
import { ProjectsModule } from "../services/projects/projects.module";
import { ReviewsModule } from "../services/reviews/reviews.module";
import { TasksModule } from "../services/tasks/tasks.module";
import { WireframesModule } from "../services/wireframes/wireframes.module";
import { McpController } from "./mcp.controller";
import { McpService } from "./mcp.service";

@Module({
  imports: [
    PrismaModule,
    ProjectsModule,
    TasksModule,
    PlansModule,
    AssetsModule,
    DraftsModule,
    DomainsModule,
    ArchitecturesModule,
    WireframesModule,
    DesignsModule,
    ReviewsModule,
  ],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}

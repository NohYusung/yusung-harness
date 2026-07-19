import { Module } from "@nestjs/common";
import { ArchitecturesModule } from "../architectures/architectures.module";
import { AssetsModule } from "../assets/assets.module";
import { DesignsModule } from "../designs/designs.module";
import { DraftsModule } from "../drafts/drafts.module";
import { PlansModule } from "../plans/plans.module";
import { ProjectsModule } from "../projects/projects.module";
import { ReviewsModule } from "../reviews/reviews.module";
import { TasksModule } from "../tasks/tasks.module";
import { WireframesModule } from "../wireframes/wireframes.module";
import { McpController } from "./mcp.controller";
import { McpService } from "./mcp.service";

@Module({
  imports: [
    ProjectsModule,
    TasksModule,
    PlansModule,
    AssetsModule,
    DraftsModule,
    ArchitecturesModule,
    WireframesModule,
    ReviewsModule,
    DesignsModule,
  ],
  controllers: [McpController],
  providers: [McpService],
})
export class McpModule {}

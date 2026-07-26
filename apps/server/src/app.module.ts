import { Module } from "@nestjs/common";
import { ArchitecturePlansModule } from "./services/architecture-plans/architecture-plans.module";
import { ArchitecturesModule } from "./services/architectures/architectures.module";
import { AssetsModule } from "./services/assets/assets.module";
import { DesignsModule } from "./services/designs/designs.module";
import { DomainsModule } from "./services/domains/domains.module";
import { DraftsModule } from "./services/drafts/drafts.module";
import { McpModule } from "./mcp/mcp.module";
import { PlansModule } from "./services/plans/plans.module";
import { ProjectsModule } from "./services/projects/projects.module";
import { RequestsModule } from "./services/requests/requests.module";
import { ReviewsModule } from "./services/reviews/reviews.module";
import { TasksModule } from "./services/tasks/tasks.module";
import { WireframesModule } from "./services/wireframes/wireframes.module";
import { WorklogsModule } from "./services/worklogs/worklogs.module";

@Module({
  imports: [
    McpModule,
    ProjectsModule,
    PlansModule,
    DraftsModule,
    TasksModule,
    WireframesModule,
    AssetsModule,
    DesignsModule,
    ReviewsModule,
    DomainsModule,
    ArchitecturesModule,
    ArchitecturePlansModule,
    RequestsModule,
    WorklogsModule,
  ],
})
export class AppModule {}

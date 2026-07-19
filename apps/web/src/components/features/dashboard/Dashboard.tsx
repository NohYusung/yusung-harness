import type { ProjectContext, ProjectSummary } from "@/types/dashboard";
import { deriveDashboardSummary } from "@/lib/dashboard";
import {
  ArtifactBrowser,
  type ArtifactRelation,
} from "./ArtifactBrowser";
import { DashboardHeader } from "./DashboardHeader";
import { PipelineStrip } from "./PipelineStrip";
import { ProjectSidebar } from "./ProjectSidebar";
import { Summary } from "./Summary";

interface DashboardProps {
  activeRelation: ArtifactRelation | null;
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
}

export function Dashboard({
  activeRelation,
  context,
  projects,
  selectedArtifactId,
}: DashboardProps) {
  const summary = deriveDashboardSummary(context);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)]">
      <ProjectSidebar
        activeRelation={activeRelation}
        context={context}
        projects={projects}
      />
      <main id="main-content" className="min-w-0">
        <div className="mx-auto w-full max-w-[96rem] px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10 2xl:px-12">
          <DashboardHeader context={context} projects={projects} />
          <Summary summary={summary} />
          <PipelineStrip context={context} />
          <ArtifactBrowser
            activeRelation={activeRelation}
            context={context}
            selectedArtifactId={selectedArtifactId}
          />
        </div>
      </main>
    </div>
  );
}

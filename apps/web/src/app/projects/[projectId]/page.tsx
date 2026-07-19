import { notFound } from "next/navigation";
import { Dashboard } from "@/components/features/dashboard/Dashboard";
import {
  getProjectContext,
  getProjects,
  HarnessApiError,
} from "@/lib/api";
import type { ArtifactRelation } from "@/components/features/dashboard/ArtifactBrowser";

const artifactRelations = [
  "plans",
  "tasks",
  "drafts",
  "architectures",
  "wireframes",
  "assets",
  "designs",
  "reviews",
] as const;

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ id?: string; type?: string }>;
}

function isArtifactRelation(value: string | undefined): value is ArtifactRelation {
  return artifactRelations.some((relation) => relation === value);
}

function toArtifactId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export default async function ProjectPage({
  params,
  searchParams,
}: ProjectPageProps) {
  const [{ projectId: projectIdParam }, query] = await Promise.all([
    params,
    searchParams,
  ]);
  const projectId = Number(projectIdParam);

  if (!Number.isSafeInteger(projectId) || projectId <= 0) {
    notFound();
  }

  const [projects, context] = await Promise.all([
    getProjects(),
    getProjectContext(projectId),
  ]).catch((error: unknown) => {
    if (error instanceof HarnessApiError && error.status === 404) {
      notFound();
    }

    throw error;
  });

  return (
    <Dashboard
      projects={projects}
      context={context}
      activeRelation={isArtifactRelation(query.type) ? query.type : null}
      selectedArtifactId={toArtifactId(query.id)}
    />
  );
}

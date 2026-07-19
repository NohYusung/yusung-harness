import "server-only";

import {
  projectContextSchema,
  projectSummarySchema,
} from "@/lib/validations/dashboard";
import type { ProjectContext, ProjectSummary } from "@/types/dashboard";

const apiUrl = (
  process.env.HARNESS_API_URL ?? "http://127.0.0.1:4000"
).replace(/\/$/, "");

export class HarnessApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "HarnessApiError";
  }
}

async function assertSuccessful(
  response: Response,
  resource: string,
): Promise<void> {
  if (response.ok) return;

  const detail = await response.text();
  const suffix = detail ? `: ${detail}` : "";
  throw new HarnessApiError(
    `Failed to load ${resource} (${response.status} ${response.statusText})${suffix}`,
    response.status,
  );
}

export async function getProjects(): Promise<ProjectSummary[]> {
  const response = await fetch(`${apiUrl}/projects`, {
    cache: "no-store",
  });

  await assertSuccessful(response, "projects");
  return projectSummarySchema.array().parse(await response.json());
}

export async function getProjectContext(
  projectId: number,
): Promise<ProjectContext> {
  if (!Number.isInteger(projectId) || projectId <= 0) {
    throw new Error(`Invalid project ID: ${projectId}`);
  }

  const response = await fetch(`${apiUrl}/projects/${projectId}`, {
    cache: "no-store",
  });

  await assertSuccessful(response, `project ${projectId}`);
  return projectContextSchema.parse(await response.json());
}

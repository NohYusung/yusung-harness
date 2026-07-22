import type { ProjectContext } from "@/types/dashboard";

export interface DashboardSummary {
  totalArtifacts: number;
  completedTasks: number;
  totalTasks: number;
  taskCompletionPercent: number;
  latestPlanVersion: number | null;
  lastActivityAt: string | null;
}

export function deriveDashboardSummary(
  context: ProjectContext,
): DashboardSummary {
  const {
    plans,
    tasks,
    drafts,
    domains,
    architectures,
    wireframes,
    assets,
    designs,
    reviews,
  } = context;

  const totalArtifacts =
    plans.length +
    tasks.length +
    drafts.length +
    domains.length +
    architectures.length +
    wireframes.length +
    assets.length +
    designs.length +
    reviews.length;
  const completedTasks = tasks.filter(
    ({ status }) => status === "COMPLETED",
  ).length;
  const totalTasks = tasks.length;
  const taskCompletionPercent =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const latestPlanVersion = plans[0]?.version ?? null;
  const activityDates = [
    ...plans.map(({ updatedAt }) => updatedAt),
    ...tasks.map(({ updatedAt }) => updatedAt),
    ...drafts.map(({ updatedAt }) => updatedAt),
    ...domains.map(({ updatedAt }) => updatedAt),
    ...architectures.map(({ updatedAt }) => updatedAt),
    ...wireframes.map(({ updatedAt }) => updatedAt),
    ...assets.map(({ updatedAt }) => updatedAt),
    ...designs.map(({ updatedAt }) => updatedAt),
    ...reviews.map(({ updatedAt }) => updatedAt),
  ];
  const lastActivityAt = activityDates.reduce<string | null>(
    (latest, current) =>
      latest === null || Date.parse(current) > Date.parse(latest)
        ? current
        : latest,
    null,
  );

  return {
    totalArtifacts,
    completedTasks,
    totalTasks,
    taskCompletionPercent,
    latestPlanVersion,
    lastActivityAt,
  };
}

import type { ProjectContext } from "@/types/dashboard";

export interface DashboardSummary {
  totalArtifacts: number;
  completedTasks: number;
  totalTasks: number;
  taskCompletionPercent: number;
  completedPlans: number;
  totalPlans: number;
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
    requests,
    workLogs,
    architecturePlans,
    databases,
    erds,
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
    reviews.length +
    requests.length +
    workLogs.length +
    architecturePlans.length +
    databases.length +
    erds.length;
  const completedTasks = tasks.filter(
    ({ status }) => status === "COMPLETED",
  ).length;
  const totalTasks = tasks.length;
  const taskCompletionPercent =
    totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);
  const completedPlans = plans.filter(
    ({ status }) => status === "COMPLETED",
  ).length;
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
    ...requests.map(({ updatedAt }) => updatedAt),
    ...workLogs.map(({ updatedAt }) => updatedAt),
    ...architecturePlans.map(({ updatedAt }) => updatedAt),
    ...databases.map(({ updatedAt }) => updatedAt),
    ...erds.map(({ updatedAt }) => updatedAt),
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
    completedPlans,
    totalPlans: plans.length,
    lastActivityAt,
  };
}

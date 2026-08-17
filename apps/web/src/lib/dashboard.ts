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
    research,
    domains,
    architectures,
    wireframes,
    assets,
    reviews,
    requests,
    workLogs,
    databases,
    erds,
  } = context;

  /** PLAN과 PRODUCTION record를 합쳐 하나의 논리 Architecture workspace로 센다. */
  const architectureWorkspaceCount = Math.min(architectures.length, 1);
  const totalArtifacts =
    plans.length +
    tasks.length +
    research.length +
    domains.length +
    architectureWorkspaceCount +
    wireframes.length +
    assets.length +
    reviews.length +
    requests.length +
    workLogs.length +
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
    ...research.map(({ updatedAt }) => updatedAt),
    ...domains.map(({ updatedAt }) => updatedAt),
    ...architectures.map(({ updatedAt }) => updatedAt),
    ...wireframes.map(({ updatedAt }) => updatedAt),
    ...assets.map(({ updatedAt }) => updatedAt),
    ...reviews.map(({ updatedAt }) => updatedAt),
    ...requests.map(({ updatedAt }) => updatedAt),
    ...workLogs.map(({ updatedAt }) => updatedAt),
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

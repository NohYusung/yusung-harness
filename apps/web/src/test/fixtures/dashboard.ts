import type {
  ArtifactDocument,
  Plan,
  ProjectContext,
  ProjectSummary,
  Task,
} from "@/types/dashboard";

const createdAt = "2026-07-18T01:00:00.000Z";
const updatedAt = "2026-07-18T02:00:00.000Z";

export function createArtifact(
  overrides: Partial<ArtifactDocument> = {},
): ArtifactDocument {
  return {
    id: 1,
    projectId: 1,
    createdAt,
    updatedAt,
    title: "산출물",
    content: "산출물 내용",
    ...overrides,
  };
}

export function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    projectId: 1,
    planId: 1,
    createdAt,
    updatedAt,
    status: "PENDING",
    title: "작업",
    content: null,
    ...overrides,
  };
}

export function createPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    ...createArtifact({ title: "계획" }),
    version: 1,
    tasks: [],
    ...overrides,
  };
}

export function createProjectContext(
  overrides: Partial<ProjectContext> = {},
): ProjectContext {
  return {
    id: 1,
    title: "Yusung Harness",
    repoPath: "/workspace/yusung-harness",
    repoType: "LOCAL",
    description: "에이전트 산출물 프로젝트",
    plans: [],
    tasks: [],
    drafts: [],
    architectures: [],
    wireframes: [],
    assets: [],
    designs: [],
    reviews: [],
    ...overrides,
  };
}

export function createProjectSummary(
  context: ProjectContext,
): ProjectSummary {
  return {
    id: context.id,
    title: context.title,
    repoPath: context.repoPath,
    repoType: context.repoType,
    description: context.description,
    _count: {
      plans: context.plans.length,
      tasks: context.tasks.length,
      drafts: context.drafts.length,
      architectures: context.architectures.length,
      wireframes: context.wireframes.length,
      assets: context.assets.length,
      designs: context.designs.length,
      reviews: context.reviews.length,
    },
  };
}

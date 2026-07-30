import type {
  ArchitecturePlan,
  ArtifactDocument,
  ArtifactRecord,
  Asset,
  Database,
  Design,
  Domain,
  Erd,
  Plan,
  ProjectContext,
  ProjectSummary,
  Request,
  Review,
  Task,
  Wireframe,
  WorkLog,
} from "@/types/dashboard";

const createdAt = "2026-07-18T01:00:00.000Z";
const updatedAt = "2026-07-18T02:00:00.000Z";

function createArtifactRecord(
  overrides: Partial<ArtifactRecord> = {},
): ArtifactRecord {
  return {
    id: 1,
    projectId: 1,
    createdAt,
    updatedAt,
    title: "Record",
    ...overrides,
  };
}

export function createArtifact(
  overrides: Partial<ArtifactDocument> = {},
): ArtifactDocument {
  return {
    ...createArtifactRecord(),
    content: "Record content",
    ...overrides,
  };
}

export function createDomain(
  overrides: Partial<Domain> = {},
): Domain {
  return createArtifact({ title: "Domain", ...overrides });
}

export function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    projectId: 1,
    planId: 1,
    createdAt,
    updatedAt,
    status: "PENDING",
    title: "Task",
    content: null,
    ...overrides,
  };
}

export function createAsset(overrides: Partial<Asset> = {}): Asset {
  return {
    ...createArtifactRecord({ title: "Asset" }),
    html: "<!doctype html><html><head><style>:root{--brand:#3559c7}</style></head><body><main>Logo and color palette</main></body></html>",
    ...overrides,
  };
}

export function createWireframe(
  overrides: Partial<Wireframe> = {},
): Wireframe {
  return {
    ...createArtifactRecord({ title: "Wireframe" }),
    parentId: null,
    index: "1",
    version: 1,
    html: "<!doctype html><html><head><title>User journey</title></head><body><a href='#next'>Next</a><section id='next'>Next step</section></body></html>",
    ...overrides,
  };
}

export function createDesign(overrides: Partial<Design> = {}): Design {
  const asset = overrides.asset ?? createAsset();
  const wireframe = overrides.wireframe ?? createWireframe();

  return {
    ...createArtifactRecord({ title: "Design" }),
    assetId: asset.id,
    wireframeId: wireframe.id,
    version: 1,
    asset,
    wireframe,
    html: "<!doctype html><html><head><style>body{color:#171b2a}</style></head><body><main>Production design</main></body></html>",
    ...overrides,
  };
}

export function createReview(overrides: Partial<Review> = {}): Review {
  return {
    ...createArtifact({ title: "Review" }),
    ...overrides,
  };
}

export function createPlan(overrides: Partial<Plan> = {}): Plan {
  return {
    ...createArtifact({ title: "Plan" }),
    status: "PENDING",
    tasks: [],
    ...overrides,
  };
}

export function createRequest(overrides: Partial<Request> = {}): Request {
  return {
    ...createArtifact({ title: "Request" }),
    status: "PENDING",
    ...overrides,
  };
}

export function createWorkLog(overrides: Partial<WorkLog> = {}): WorkLog {
  return createArtifact({ title: "WorkLog", ...overrides });
}

export function createArchitecturePlan(
  overrides: Partial<ArchitecturePlan> = {},
): ArchitecturePlan {
  return {
    ...createArtifact({
      content:
        "<!doctype html><html><head><title>Architecture plan</title></head><body><main>Architecture plan</main></body></html>",
      title: "Architecture Plan",
    }),
    html: "",
    ...overrides,
  };
}

export function createDatabase(
  overrides: Partial<Database> = {},
): Database {
  return createArtifact({ title: "DB", ...overrides });
}

export function createErd(overrides: Partial<Erd> = {}): Erd {
  return {
    ...createArtifactRecord({ title: "ERD" }),
    html: "<!doctype html><html><head><title>ERD</title></head><body><main>ERD</main></body></html>",
    ...overrides,
  };
}

export function createProjectContext(
  overrides: Partial<ProjectContext> = {},
): ProjectContext {
  return {
    id: 1,
    title: "Yusung Harness",
    repoPaths: [
      { path: "/workspace/yusung-harness-backend", repoType: "LOCAL" },
      { path: "/workspace/yusung-harness-web", repoType: "LOCAL" },
    ],
    description: "Harness agent Project records",
    plans: [],
    tasks: [],
    drafts: [],
    domains: [],
    architectures: [],
    wireframes: [],
    assets: [],
    designs: [],
    requests: [],
    reviews: [],
    workLogs: [],
    architecturePlans: [],
    databases: [],
    erds: [],
    ...overrides,
  };
}

export function createProjectSummary(
  context: ProjectContext,
): ProjectSummary {
  return {
    id: context.id,
    title: context.title,
    repoPaths: context.repoPaths,
    description: context.description,
    _count: {
      plans: context.plans.length,
      tasks: context.tasks.length,
      drafts: context.drafts.length,
      domains: context.domains.length,
      architectures: context.architectures.length,
      wireframes: context.wireframes.length,
      assets: context.assets.length,
      designs: context.designs.length,
      requests: context.requests.length,
      reviews: context.reviews.length,
      workLogs: context.workLogs.length,
      architecturePlans: context.architecturePlans.length,
      databases: context.databases.length,
      erds: context.erds.length,
    },
  };
}

import type {
  Architecture,
  ArtifactDocument,
  ArtifactRecord,
  Asset,
  Database,
  Domain,
  Erd,
  Plan,
  ProjectContext,
  ProjectSummary,
  Research,
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
  return {
    ...createArtifact({ title: "Domain" }),
    parentId: null,
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

export function createReview(overrides: Partial<Review> = {}): Review {
  return {
    ...createArtifact({ title: "Review" }),
    ...overrides,
  };
}

/** PLAN과 PRODUCTION 통합 계약을 사용하는 Architecture fixture를 생성한다. */
export function createArchitecture(
  overrides: Partial<Architecture> = {},
): Architecture {
  return {
    ...createArtifact({ title: "Architecture" }),
    type: "PRODUCTION",
    html: "",
    ...overrides,
  };
}

/** 조사 결과 Markdown 문서를 생성하는 Research fixture. */
export function createResearch(
  overrides: Partial<Research> = {},
): Research {
  return createArtifact({ title: "Research", ...overrides });
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

export function createDatabase(
  overrides: Partial<Database> = {},
): Database {
  return createArtifact({ title: "DB", ...overrides });
}

/** ERD parser와 Dineug custom element 테스트가 공유하는 최소 v3 document. */
export function createErdDocument(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    $schema:
      "https://raw.githubusercontent.com/dineug/erd-editor/main/json-schema/schema.json",
    version: "3.0.0",
    settings: {
      width: 2000,
      height: 2000,
      scrollTop: 0,
      scrollLeft: 0,
      zoomLevel: 1,
      show: 511,
      database: 32,
      databaseName: "harness",
      canvasType: "ERD",
      language: 16,
      tableNameCase: 1,
      columnNameCase: 1,
      bracketType: 1,
      relationshipDataTypeSync: true,
      relationshipOptimization: false,
      columnOrder: [1, 2, 4, 8, 16, 32, 64],
      maxWidthComment: -1,
      ignoreSaveSettings: 3,
    },
    doc: {
      tableIds: ["table-7dfb4cf67742cb066030"],
      relationshipIds: [],
      indexIds: [],
      memoIds: [],
    },
    collections: {
      tableEntities: {
        "table-7dfb4cf67742cb066030": {
          id: "table-7dfb4cf67742cb066030",
          name: "users",
          comment: "identity table",
          columnIds: ["column-ea72dfea08f0938f4531"],
          seqColumnIds: ["column-ea72dfea08f0938f4531"],
          ui: {
            x: 100,
            y: 100,
            zIndex: 1,
            widthName: 300,
            widthComment: 60,
            color: "#8b5cf6",
          },
          meta: { updateAt: 0, createAt: 0 },
        },
      },
      tableColumnEntities: {
        "column-ea72dfea08f0938f4531": {
          id: "column-ea72dfea08f0938f4531",
          tableId: "table-7dfb4cf67742cb066030",
          name: "id",
          comment: "primary identifier",
          dataType: "INTEGER",
          default: "",
          options: 10,
          ui: {
            keys: 1,
            widthName: 180,
            widthComment: 60,
            widthDataType: 180,
            widthDefault: 180,
          },
          meta: { updateAt: 0, createAt: 0 },
        },
      },
      relationshipEntities: {},
      indexEntities: {},
      indexColumnEntities: {},
      memoEntities: {},
    },
    ...overrides,
  };
}

export function createErd(overrides: Partial<Erd> = {}): Erd {
  return {
    ...createArtifactRecord({ title: "ERD" }),
    document: JSON.stringify(createErdDocument()),
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
    research: [],
    domains: [],
    architectures: [],
    wireframes: [],
    assets: [],
    requests: [],
    reviews: [],
    workLogs: [],
    databases: [],
    erds: [],
    ...overrides,
  };
}

export function createProjectSummary(
  context: ProjectContext,
): ProjectSummary {
  /** PLAN과 PRODUCTION의 물리 record 수를 논리 Architecture workspace count로 축약한다. */
  const architectureWorkspaceCount = Math.min(context.architectures.length, 1);

  return {
    id: context.id,
    title: context.title,
    repoPaths: context.repoPaths,
    description: context.description,
    _count: {
      plans: context.plans.length,
      tasks: context.tasks.length,
      research: context.research.length,
      domains: context.domains.length,
      architectures: architectureWorkspaceCount,
      wireframes: context.wireframes.length,
      assets: context.assets.length,
      requests: context.requests.length,
      reviews: context.reviews.length,
      workLogs: context.workLogs.length,
      databases: context.databases.length,
      erds: context.erds.length,
    },
  };
}

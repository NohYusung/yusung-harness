export type RepoType = "LOCAL" | "REMOTE";
export type TaskStatus = "PENDING" | "COMPLETED";

/** NestJS 목록 API의 공통 응답 envelope. */
export interface ListResponse<T> {
  data: T[];
}

export interface ArtifactCounts {
  plans: number;
  tasks: number;
  drafts: number;
  domains: number;
  architectures: number;
  wireframes: number;
  assets: number;
  designs: number;
  reviews: number;
}

export interface ProjectSummary {
  id: number;
  title: string;
  repoPath: string;
  repoType: RepoType;
  description: string;
  _count: ArtifactCounts;
}

export interface ArtifactRecord {
  id: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  title: string;
}

export interface ArtifactDocument extends ArtifactRecord {
  content: string;
}

export interface HtmlArtifactDocument extends ArtifactRecord {
  html: string;
}

export interface TaskLinkedHtmlArtifact extends HtmlArtifactDocument {
  planId: number;
  taskId: number;
}

export interface PlanLinkedDocument extends ArtifactDocument {
  planId: number;
}

export type Wireframe = TaskLinkedHtmlArtifact;
export type Asset = TaskLinkedHtmlArtifact;

export interface Design extends TaskLinkedHtmlArtifact {
  wireframeId: number;
  assetId: number;
  wireframe: Wireframe;
  asset: Asset;
}

export interface Task {
  id: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  planId: number;
  status: TaskStatus;
  title: string;
  content: string | null;
  assets: Asset[];
  wireframes: Wireframe[];
  designs: Design[];
}

export interface Plan extends ArtifactDocument {
  version: number;
  tasks: Task[];
  assets: Asset[];
  wireframes: Wireframe[];
  designs: Design[];
  reviews: Review[];
}

export type Draft = ArtifactDocument;
/** 완성된 프로젝트의 ERD snapshot record. */
export type Domain = ArtifactDocument;
/** 프로젝트 배포 구조 snapshot 또는 legacy text record. */
export type Architecture = ArtifactDocument;
export type Review = PlanLinkedDocument;

export interface ProjectContext {
  id: number;
  title: string;
  repoPath: string;
  repoType: RepoType;
  description: string;
  plans: Plan[];
  tasks: Task[];
  drafts: Draft[];
  domains: Domain[];
  architectures: Architecture[];
  wireframes: Wireframe[];
  assets: Asset[];
  designs: Design[];
  reviews: Review[];
}

/** 프로젝트 선택 목록과 선택한 프로젝트의 전체 대시보드 context. */
export interface ProjectDashboard {
  projects: ProjectSummary[];
  context: ProjectContext;
}

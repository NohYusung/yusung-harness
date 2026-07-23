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

export interface ProjectRepository {
  path: string;
  repoType: RepoType;
}

export interface ProjectSummary {
  id: number;
  title: string;
  repoPaths: ProjectRepository[];
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

export type Wireframe = HtmlArtifactDocument;
export type Asset = HtmlArtifactDocument;

export interface Design extends HtmlArtifactDocument {
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
}

export interface Plan extends ArtifactDocument {
  version: number;
  tasks: Task[];
}

export type Draft = ArtifactDocument;
/** 완성된 프로젝트의 ERD snapshot record. */
export type Domain = ArtifactDocument;
/** 프로젝트 배포 구조 snapshot 또는 legacy text record. */
export type Architecture = ArtifactDocument;
export type Review = ArtifactDocument;

export interface ProjectContext {
  id: number;
  title: string;
  repoPaths: ProjectRepository[];
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

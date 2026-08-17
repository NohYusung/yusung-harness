export type RepoType = "LOCAL" | "REMOTE";
export type TaskStatus = "PENDING" | "COMPLETED";
export type PlanStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
export type RequestStatus = "PENDING" | "IN_PROGRESS" | "COMPLETED";
/** Architecture workspace 안에서 구현 계획과 현행 구조를 구분하는 저장 type. */
export type ArchitectureType = "PLAN" | "PRODUCTION";

/** 새 Request 문서 생성에 필요한 입력. */
export interface CreateRequestInput {
  title: string;
  content: string;
}

/** 기존 Request 문서와 lifecycle 상태 수정에 필요한 입력. */
export interface UpdateRequestInput extends CreateRequestInput {
  status: RequestStatus;
}

/** NestJS 목록 API의 공통 응답 envelope. */
export interface ListResponse<T> {
  data: T[];
}

export interface ArtifactCounts {
  plans: number;
  tasks: number;
  research: number;
  domains: number;
  architectures: number;
  wireframes: number;
  assets: number;
  reviews: number;
  requests: number;
  workLogs: number;
  databases: number;
  erds: number;
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

export interface Wireframe extends HtmlArtifactDocument {
  parentId: number | null;
  index: string;
  version: number;
}

export type Asset = HtmlArtifactDocument;

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
  status: PlanStatus;
  tasks: Task[];
}

/** 프로젝트 구현 판단을 뒷받침하는 조사 결과 Markdown 문서. */
export type Research = ArtifactDocument;
/** 업무 도메인의 책임과 규칙을 설명하는 계층형 Markdown 페이지. */
export interface Domain extends ArtifactDocument {
  parentId: number | null;
}
/** 프로젝트의 구현 계획 또는 현행 배포 구조를 표현하는 통합 Architecture record. */
export interface Architecture extends ArtifactDocument {
  type: ArchitectureType;
  html: string;
}
export type Review = ArtifactDocument;

/** 프로젝트에서 수행한 단일 작업 내역 문서. */
export type WorkLog = ArtifactDocument;

/** 프로젝트의 현행 DB 스키마 Markdown 문서. */
export type Database = ArtifactDocument;

/** 프로젝트 DB 관계를 표현하는 읽기 전용 Dineug v3 문서. */
export interface Erd extends ArtifactRecord {
  document: string | null;
}

/** 프로젝트에 접수된 작업 요청과 진행 상태. */
export interface Request extends ArtifactDocument {
  status: RequestStatus;
}

export interface ProjectContext {
  id: number;
  title: string;
  repoPaths: ProjectRepository[];
  description: string;
  plans: Plan[];
  tasks: Task[];
  research: Research[];
  domains: Domain[];
  architectures: Architecture[];
  wireframes: Wireframe[];
  assets: Asset[];
  reviews: Review[];
  requests: Request[];
  workLogs: WorkLog[];
  databases: Database[];
  erds: Erd[];
}

/** 프로젝트 선택 목록과 선택한 프로젝트의 전체 대시보드 context. */
export interface ProjectDashboard {
  projects: ProjectSummary[];
  context: ProjectContext;
}

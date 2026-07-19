export type RepoType = "LOCAL" | "REMOTE";
export type TaskStatus = "PENDING" | "COMPLETED";

export interface ArtifactCounts {
  plans: number;
  tasks: number;
  drafts: number;
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

export interface ArtifactDocument {
  id: number;
  projectId: number;
  createdAt: string;
  updatedAt: string;
  title: string;
  content: string;
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
export type Architecture = ArtifactDocument;
export type Wireframe = ArtifactDocument;
export type Asset = ArtifactDocument;
export type Review = ArtifactDocument;

export interface Design extends ArtifactDocument {
  wireframeId: number;
  assetId: number;
  wireframe: Wireframe;
  asset: Asset;
}

export interface ProjectContext {
  id: number;
  title: string;
  repoPath: string;
  repoType: RepoType;
  description: string;
  plans: Plan[];
  tasks: Task[];
  drafts: Draft[];
  architectures: Architecture[];
  wireframes: Wireframe[];
  assets: Asset[];
  designs: Design[];
  reviews: Review[];
}

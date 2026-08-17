"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  ArtifactHtmlPreviewFrame,
  type HtmlArtifactKind,
  type HtmlArtifactSelection,
  type HtmlPreviewWireframeNavigation,
  type PreviewViewportMode,
  previewViewportPresets,
} from "@/components/features/dashboard/ArtifactHtmlSidePage";
import { ErdDineugPreview } from "@/components/features/dashboard/ErdDineugPreview";
import { MarkdownContent } from "@/components/features/dashboard/MarkdownContent";
import { RequestDocumentEditor } from "@/components/features/dashboard/RequestDocumentEditor";
import { formatDashboardDate } from "@/lib/date";
import {
  buildDomainTree,
  flattenDomainTree,
  getDomainAncestorIds,
  getDomainSearchIds,
  type DomainTreeRow,
} from "@/lib/domain-tree";
import type {
  Architecture,
  ArtifactDocument,
  Domain,
  Erd,
  HtmlArtifactDocument,
  Plan,
  ProjectContext,
  ProjectSummary,
  Request,
  Review,
  Task,
  Wireframe,
  WorkspaceRelation,
} from "@/types/dashboard";
import { ArchitectureWorkspace } from "./ArchitectureWorkspace";
import { ProjectPicker } from "./ProjectPicker";

type WorkbenchRelation = WorkspaceRelation | "tasks";

type WorkbenchRecord =
  | ArtifactDocument
  | HtmlArtifactDocument
  | Erd
  | Plan
  | Review
  | Task;

interface WorkbenchEntry {
  record: WorkbenchRecord;
  relation: WorkbenchRelation;
}

/** Wireframe 목록 제목에 적용할 1단계 계층과 유효한 부모 record. */
interface WireframeHierarchy {
  depth: 0 | 1;
  parent: Wireframe | null;
}

interface ArtifactWorkbenchProps {
  activeRelation: WorkspaceRelation;
  architectureView: ArchitectureView | null;
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

type MobilePane = "tree" | "records" | "detail";
/** Architecture workspace 중앙 탭과 URL이 공유하는 view. */
export type ArchitectureView = "plan" | "current";
type RecordStatus = "Completed" | "In progress" | "Pending";
type StatusFilter = "All" | RecordStatus;
type RequestEditorMode =
  | { type: "create" }
  | { type: "update"; requestId: number };
/** Architecture Plan detail이 배타적으로 표시하는 문서와 구조도 뷰. */
type ArchitecturePlanView = "content" | "diagram";

interface RelationConfig {
  code: string;
  label: string;
  plural: string;
  dotClassName: string;
}

/** 좌측 Explorer의 하나의 workspace 진입점. */
interface NavigationItemDescriptor {
  architectureView?: ArchitectureView;
  code: string;
  id: string;
  label: string;
  relation: WorkspaceRelation;
}

/** 작업 관리와 현행 프로젝트 상태를 분리하는 고정 navigation section. */
interface NavigationSectionDescriptor {
  id: string;
  items: readonly NavigationItemDescriptor[];
  label: string;
}

const relationOrder: readonly WorkbenchRelation[] = [
  "plans",
  "tasks",
  "research",
  "domains",
  "architectures",
  "wireframes",
  "assets",
  "reviews",
  "requests",
  "workLogs",
  "databases",
  "erds",
];

const relationConfig: Record<WorkbenchRelation, RelationConfig> = {
  plans: {
    code: "PL",
    label: "Plan",
    plural: "Plans",
    dotClassName: "bg-primary",
  },
  tasks: {
    code: "TK",
    label: "Task",
    plural: "Tasks",
    dotClassName: "bg-success",
  },
  research: {
    code: "RS",
    label: "Research",
    plural: "Research",
    dotClassName: "bg-warning",
  },
  domains: {
    code: "DM",
    label: "Domain",
    plural: "Domains",
    dotClassName: "bg-olive",
  },
  architectures: {
    code: "AR",
    label: "Architecture",
    plural: "Architecture",
    dotClassName: "bg-plum",
  },
  wireframes: {
    code: "WF",
    label: "Wireframe",
    plural: "Wireframes",
    dotClassName: "bg-olive",
  },
  assets: {
    code: "AS",
    label: "Asset",
    plural: "Assets",
    dotClassName: "bg-clay",
  },
  reviews: {
    code: "RV",
    label: "Review",
    plural: "Reviews",
    dotClassName: "bg-danger",
  },
  requests: {
    code: "RQ",
    label: "Request",
    plural: "Requests",
    dotClassName: "bg-primary",
  },
  workLogs: {
    code: "WL",
    label: "WorkLog",
    plural: "WorkLogs",
    dotClassName: "bg-clay",
  },
  databases: {
    code: "DB",
    label: "DB",
    plural: "DB",
    dotClassName: "bg-clay",
  },
  erds: {
    code: "ERD",
    label: "ERD",
    plural: "ERD",
    dotClassName: "bg-success",
  },
};

/**
 * 좌측 Explorer의 정보 구조.
 * Task는 별도 메뉴로 복제하지 않고 Plan 계층 안에서 관리한다.
 */
const navigationSections = [
  {
    id: "planning-work",
    label: "Planning & Work",
    items: [
      { code: "PL", id: "plans", label: "Plans", relation: "plans" },
      {
        code: "RS",
        id: "research",
        label: "Research",
        relation: "research",
      },
      {
        architectureView: "plan",
        code: "AP",
        id: "architecture-plan",
        label: "Architecture Plan",
        relation: "architectures",
      },
      { code: "AS", id: "assets", label: "Assets", relation: "assets" },
      {
        code: "WF",
        id: "wireframes",
        label: "Wireframes",
        relation: "wireframes",
      },
      {
        code: "RQ",
        id: "requests",
        label: "Requests",
        relation: "requests",
      },
      {
        code: "WL",
        id: "work-logs",
        label: "WorkLogs",
        relation: "workLogs",
      },
    ],
  },
  {
    id: "project-status",
    label: "Project Status",
    items: [
      {
        architectureView: "current",
        code: "CA",
        id: "current-architecture",
        label: "Current Architecture",
        relation: "architectures",
      },
      { code: "DB", id: "databases", label: "DB", relation: "databases" },
      { code: "ERD", id: "erds", label: "ERD", relation: "erds" },
      { code: "DM", id: "domains", label: "Domains", relation: "domains" },
      { code: "RV", id: "reviews", label: "Reviews", relation: "reviews" },
    ],
  },
] as const satisfies readonly NavigationSectionDescriptor[];

/** Desktop detail pane이 viewport에서 차지하는 초기 비율과 조절 범위. */
const defaultDetailPaneRatio = 30;
const minimumDetailPaneRatio = 15;
const maximumDetailPaneRatio = 70;
const detailPaneResizeStep = 2;
const metadataCollapseScrollThreshold = 120;

/** Pointer와 keyboard 입력으로 계산한 viewport 비율을 15~70%로 제한한다. */
function clampDetailPaneRatio(ratio: number): number {
  const roundedRatio = Math.round(ratio * 100) / 100;
  return Math.min(
    maximumDetailPaneRatio,
    Math.max(minimumDetailPaneRatio, roundedRatio),
  );
}

function getEntryKey(entry: WorkbenchEntry): string {
  return `${entry.relation}-${entry.record.id}`;
}

/** typed Architecture record를 대응하는 중앙 탭 view로 변환한다. */
function getArchitectureView(architecture: Architecture): ArchitectureView {
  if (architecture.type === "PLAN") {
    return "plan";
  }

  if (architecture.type === "PRODUCTION") {
    return "current";
  }

  return "current";
}

/** Architecture view에 대응하는 프로젝트의 단일 typed record를 찾는다. */
function getArchitectureForView(
  architectures: readonly Architecture[],
  view: ArchitectureView,
): Architecture | null {
  return (
    architectures.find(
      (architecture) => getArchitectureView(architecture) === view,
    ) ?? null
  );
}

/** URL·legacy ID·보유 record 순으로 최초 Architecture view를 결정한다. */
function getInitialArchitectureView(
  architectures: readonly Architecture[],
  requestedView: ArchitectureView | null,
  selectedArtifactId: number | null,
): ArchitectureView {
  if (requestedView) {
    return requestedView;
  }

  const selectedArchitecture =
    selectedArtifactId === null
      ? null
      : (architectures.find(
          (architecture) => architecture.id === selectedArtifactId,
        ) ?? null);
  if (selectedArchitecture) {
    return getArchitectureView(selectedArchitecture);
  }

  return architectures.some(
    (architecture) => architecture.type === "PRODUCTION",
  )
    ? "current"
    : "plan";
}

/** 빈 목록에서 다른 artifact를 detail fallback으로 쓰지 않는 독립 workspace를 판별한다. */
function keepsEmptySelection(relation: WorkbenchRelation): boolean {
  return (
    relation === "domains" ||
    relation === "research" ||
    relation === "architectures" ||
    relation === "reviews" ||
    relation === "requests" ||
    relation === "workLogs" ||
    relation === "databases" ||
    relation === "erds"
  );
}

function getEntries(
  context: ProjectContext,
  requests: readonly Request[] = context.requests,
): WorkbenchEntry[] {
  /** Plan deep link가 context.tasks를 좁혀도 계층 목록은 모든 Plan의 Task를 보존한다. */
  const planTasks = context.plans.flatMap((plan) => plan.tasks);
  const entriesByRelation: Record<WorkbenchRelation, WorkbenchRecord[]> = {
    plans: context.plans,
    tasks: planTasks,
    research: [...context.research].sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        right.id - left.id,
    ),
    domains: context.domains,
    architectures: context.architectures,
    wireframes: context.wireframes,
    assets: context.assets,
    reviews: context.reviews,
    requests: [...requests],
    workLogs: context.workLogs,
    databases: context.databases,
    erds: context.erds,
  };

  return relationOrder.flatMap((relation) =>
    entriesByRelation[relation].map((record) => ({ record, relation })),
  );
}

/** 직접 연 Plan 또는 Task deep link의 부모 Plan을 초기 펼침 상태로 복원한다. */
function getInitialExpandedPlanIds(
  activeRelation: WorkspaceRelation,
  context: ProjectContext,
  selectedArtifactId: number | null,
  selectedTaskId: number | null,
): ReadonlySet<number> {
  if (activeRelation !== "plans") {
    return new Set();
  }

  /** Task deep link에서는 Task를 소유한 Plan을 artifact id보다 우선한다. */
  const selectedTaskPlan =
    selectedTaskId === null
      ? undefined
      : context.plans.find((plan) =>
          plan.tasks.some((task) => task.id === selectedTaskId),
        );
  const selectedPlanId = selectedTaskPlan?.id ?? selectedArtifactId;

  if (
    selectedPlanId === null ||
    !context.plans.some((plan) => plan.id === selectedPlanId)
  ) {
    return new Set();
  }

  return new Set([selectedPlanId]);
}

/** parentId와 index가 일치하는 Wireframe만 child로 표시하고 비정상 관계는 root로 되돌린다. */
function getWireframeHierarchy(
  entry: WorkbenchEntry,
  wireframesById: ReadonlyMap<number, Wireframe>,
): WireframeHierarchy | null {
  if (entry.relation !== "wireframes") {
    return null;
  }

  const wireframe = entry.record as Wireframe;

  if (wireframe.parentId === null) {
    return { depth: 0, parent: null };
  }

  const parent = wireframesById.get(wireframe.parentId);

  if (!parent || !wireframe.index.startsWith(`${parent.index}.`)) {
    return { depth: 0, parent: null };
  }

  const visitedIds = new Set<number>();
  let ancestor: Wireframe | undefined = wireframe;

  /** 자기 참조와 순환 parent chain은 계층 표식 없이 안전하게 렌더링한다. */
  while (ancestor) {
    if (visitedIds.has(ancestor.id)) {
      return { depth: 0, parent: null };
    }

    visitedIds.add(ancestor.id);
    ancestor =
      ancestor.parentId === null
        ? undefined
        : wireframesById.get(ancestor.parentId);
  }

  return { depth: 1, parent };
}

/** Plan과 Task의 저장 lifecycle 상태를 일관된 UI label로 변환한다. */
function getStatus(
  entry: WorkbenchEntry,
): RecordStatus | null {
  if (entry.relation === "plans") {
    const status = (entry.record as Plan).status;

    if (status === "COMPLETED") return "Completed";
    if (status === "IN_PROGRESS") return "In progress";
    return "Pending";
  }

  if (entry.relation === "tasks") {
    return (entry.record as Task).status === "COMPLETED"
      ? "Completed"
      : "Pending";
  }

  /** Request lifecycle 상태를 Plan과 같은 record 상태 label로 변환한다. */
  if (entry.relation === "requests") {
    const status = (entry.record as Request).status;

    if (status === "COMPLETED") return "Completed";
    if (status === "IN_PROGRESS") return "In progress";
    return "Pending";
  }

  return null;
}

/** NO와 UPDATED 칼럼으로 이동하지 않는 Plan/Task 관계 정보만 제목 아래에 남긴다. */
function getEntrySecondaryMeta(
  entry: WorkbenchEntry,
  context: ProjectContext,
): string | null {
  if (entry.relation === "plans") {
    const plan = entry.record as Plan;
    const completed = plan.tasks.filter(
      (task) => task.status === "COMPLETED",
    ).length;
    return `${completed}/${plan.tasks.length} Tasks complete`;
  }

  if (entry.relation === "tasks") {
    const task = entry.record as Task;
    const plan = context.plans.find(
      (candidate) => candidate.id === task.planId,
    );
    return plan ? `Plan #${plan.id}` : null;
  }

  return null;
}

function getSource(entry: WorkbenchEntry): string {
  return `${entry.relation.replace(/s$/, "")}/${entry.record.id}`;
}

function getContent(entry: WorkbenchEntry): string {
  if (entry.relation === "tasks") {
    return (
      (entry.record as Task).content ?? "No task notes have been saved yet."
    );
  }

  return (entry.record as ArtifactDocument).content;
}

function getRelations(
  entry: WorkbenchEntry,
  context: ProjectContext,
): WorkbenchEntry[] {
  if (entry.relation === "plans") {
    const plan = entry.record as Plan;
    return plan.tasks.map((record) => ({ record, relation: "tasks" }));
  }

  if (entry.relation === "tasks") {
    const task = entry.record as Task;
    const plan = context.plans.find(
      (candidate) => candidate.id === task.planId,
    );
    return plan ? [{ record: plan, relation: "plans" }] : [];
  }

  if (entry.relation === "domains") {
    const domain = entry.record as Domain;
    const parent =
      domain.parentId === null
        ? undefined
        : context.domains.find((candidate) => candidate.id === domain.parentId);
    const children = context.domains
      .filter((candidate) => candidate.parentId === domain.id)
      .sort((left, right) => left.id - right.id);

    return [
      ...(parent ? [{ record: parent, relation: "domains" as const }] : []),
      ...children.map((record) => ({
        record,
        relation: "domains" as const,
      })),
    ];
  }

  return [];
}

function getHtmlSelection(entry: WorkbenchEntry): HtmlArtifactSelection | null {
  /** PLAN Architecture는 별도 html 구조도를 가진 hybrid preview로 분류한다. */
  if (
    entry.relation === "architectures" &&
    (entry.record as Architecture).type === "PLAN"
  ) {
    const architecturePlan = entry.record as Architecture;
    return { kind: "Architecture Plan", record: architecturePlan };
  }

  const kindByRelation: Partial<Record<WorkbenchRelation, HtmlArtifactKind>> = {
    assets: "Asset",
    wireframes: "Wireframe",
  };
  const kind = kindByRelation[entry.relation];

  return kind ? { kind, record: entry.record as HtmlArtifactDocument } : null;
}

/** HTML artifact의 Metadata에 sandbox preview와 Wireframe 전환 callback을 연결한다. */
function WorkbenchHtmlPreview({
  onNavigateWireframe,
  onScrollStateChange,
  onViewportChange,
  record,
  viewport,
}: {
  onNavigateWireframe: (target: HtmlPreviewWireframeNavigation) => void;
  onScrollStateChange: (scrollTop: number) => void;
  onViewportChange?: (viewport: PreviewViewportMode) => void;
  record: HtmlArtifactDocument;
  viewport?: PreviewViewportMode;
}) {
  const previewCanvasRef = useRef<HTMLDivElement>(null);

  /** viewport 전환 시 바깥 canvas를 원점으로 복원하고 iframe 자체는 재사용한다. */
  function selectViewport(nextViewport: PreviewViewportMode) {
    const previewCanvas = previewCanvasRef.current;

    if (previewCanvas) {
      previewCanvas.scrollLeft = 0;
      previewCanvas.scrollTop = 0;
    }
    onViewportChange?.(nextViewport);
    window.requestAnimationFrame(() => {
      const updatedPreviewCanvas = previewCanvasRef.current;

      if (updatedPreviewCanvas) {
        updatedPreviewCanvas.scrollLeft = 0;
        updatedPreviewCanvas.scrollTop = 0;
      }
    });
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 max-w-full flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card">
      {viewport && onViewportChange ? (
        <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted px-3 py-2">
          <span className="text-xs font-semibold text-muted">Viewport</span>
          <div
            aria-label="Preview viewport"
            className="flex rounded-control border border-line bg-surface p-1"
            role="group"
          >
            {(["mobile", "desktop"] as const).map((mode) => {
              const preset = previewViewportPresets[mode];

              return (
                <button
                  aria-label={`${preset.label} ${preset.width} × ${preset.height}`}
                  aria-pressed={viewport === mode}
                  className="flex min-h-11 min-w-16 flex-col items-center justify-center rounded-control px-2 text-xs font-semibold text-muted transition-colors aria-pressed:bg-primary aria-pressed:text-white focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none"
                  key={mode}
                  onClick={() => selectViewport(mode)}
                  type="button"
                >
                  <span>{preset.label}</span>
                  <span className="font-mono text-micro font-normal opacity-75">
                    {preset.width} × {preset.height}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div
        ref={previewCanvasRef}
        aria-label={viewport ? `${record.title} preview canvas` : undefined}
        className={
          viewport
            ? "min-h-0 min-w-0 max-w-full flex-1 overflow-auto bg-canvas p-3 [overflow-anchor:none]"
            : "min-h-0 flex-1 overflow-hidden"
        }
        data-preview-canvas={viewport ? "true" : undefined}
        role={viewport ? "region" : undefined}
        tabIndex={viewport ? 0 : undefined}
      >
        <ArtifactHtmlPreviewFrame
          onNavigateWireframe={onNavigateWireframe}
          onScrollStateChange={onScrollStateChange}
          record={record}
          viewport={viewport}
        />
      </div>
    </div>
  );
}

/** Architecture Plan의 문서 content와 별도 html 구조도를 접근 가능한 탭으로 분리한다. */
function ArchitecturePlanPreview({
  onNavigateWireframe,
  onScrollStateChange,
  record,
}: {
  onNavigateWireframe: (target: HtmlPreviewWireframeNavigation) => void;
  onScrollStateChange: (scrollTop: number) => void;
  record: Architecture;
}) {
  const [activeView, setActiveView] =
    useState<ArchitecturePlanView>("content");
  const contentTabRef = useRef<HTMLButtonElement>(null);
  const diagramTabRef = useRef<HTMLButtonElement>(null);
  const contentTabId = `architecture-plan-${record.id}-content-tab`;
  const diagramTabId = `architecture-plan-${record.id}-diagram-tab`;
  const panelId = `architecture-plan-${record.id}-view-panel`;
  const activeTabId =
    activeView === "content" ? contentTabId : diagramTabId;

  /** 탭 전환 시 새 preview의 최상단 상태에 맞춰 접힌 metadata를 복원한다. */
  function selectView(view: ArchitecturePlanView) {
    setActiveView(view);
    onScrollStateChange(0);
  }

  /** 수평 tablist의 방향키와 Home/End 키로 선택과 focus를 함께 이동한다. */
  function handleTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    view: ArchitecturePlanView,
  ) {
    let nextView: ArchitecturePlanView | null = null;

    /** 두 탭은 좌우 이동 시 서로 순환한다. */
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextView = view === "content" ? "diagram" : "content";
    } else if (event.key === "Home") {
      nextView = "content";
    } else if (event.key === "End") {
      nextView = "diagram";
    }

    /** tablist 이동 키가 아니면 button의 기본 입력을 그대로 유지한다. */
    if (!nextView) {
      return;
    }

    event.preventDefault();
    selectView(nextView);
    (nextView === "content" ? contentTabRef : diagramTabRef).current?.focus();
  }

  return (
    <div className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
      <div
        aria-label="Architecture Plan views"
        className="flex min-h-11 items-end gap-1 border-b border-line"
        role="tablist"
      >
        <button
          ref={contentTabRef}
          aria-controls={panelId}
          aria-selected={activeView === "content"}
          className="min-h-11 border-0 border-b-2 border-transparent bg-transparent px-3 text-xs font-semibold text-muted hover:text-ink aria-selected:border-accent aria-selected:text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          id={contentTabId}
          onClick={() => selectView("content")}
          onKeyDown={(event) => handleTabKeyDown(event, "content")}
          role="tab"
          tabIndex={activeView === "content" ? 0 : -1}
          type="button"
        >
          Content
        </button>
        <button
          ref={diagramTabRef}
          aria-controls={panelId}
          aria-selected={activeView === "diagram"}
          className="min-h-11 border-0 border-b-2 border-transparent bg-transparent px-3 text-xs font-semibold text-muted hover:text-ink aria-selected:border-accent aria-selected:text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          id={diagramTabId}
          onClick={() => selectView("diagram")}
          onKeyDown={(event) => handleTabKeyDown(event, "diagram")}
          role="tab"
          tabIndex={activeView === "diagram" ? 0 : -1}
          type="button"
        >
          구조도
        </button>
      </div>

      <div
        aria-labelledby={activeTabId}
        className="min-h-0"
        id={panelId}
        role="tabpanel"
        tabIndex={0}
      >
        {activeView === "content" ? (
          <article
            aria-label="Architecture Plan content"
            className="h-full min-h-0 overflow-auto rounded-card border border-line bg-surface p-4"
          >
            <MarkdownContent content={record.content} />
          </article>
        ) : record.html.trim().length === 0 ? (
          <div className="grid h-full min-h-48 place-items-center rounded-card border border-line bg-surface-muted px-6 text-center">
            <div>
              <p className="m-0 text-sm font-semibold text-ink">
                Preview unavailable
              </p>
              <p className="mt-2 mb-0 text-xs leading-5 text-muted">
                Architecture Plan의 html 칼럼에 구조도가 저장되면 여기에
                표시됩니다.
              </p>
            </div>
          </div>
        ) : (
          <WorkbenchHtmlPreview
            onNavigateWireframe={onNavigateWireframe}
            onScrollStateChange={onScrollStateChange}
            record={record}
          />
        )}
      </div>
    </div>
  );
}

/** lifecycle 상태 badge의 의미에 맞는 색상만 선택한다. */
function getStatusClassName(status: RecordStatus): string {
  if (status === "Completed") {
    return "inline-flex w-max rounded-full border border-success/35 bg-success-soft px-[7px] py-[3px] font-mono text-[10px] text-success";
  }
  if (status === "Pending") {
    return "inline-flex w-max rounded-full border border-line-strong bg-surface-muted px-[7px] py-[3px] font-mono text-[10px] text-muted";
  }
  return "inline-flex w-max rounded-full border border-primary/35 bg-primary-soft px-[7px] py-[3px] font-mono text-[10px] text-primary";
}

function getRelationHref(entry: WorkbenchEntry, projectId: number): string {
  if (entry.relation === "tasks") {
    const task = entry.record as Task;
    return `/projects/${projectId}?type=plans&id=${task.planId}&taskId=${task.id}`;
  }

  /** Architecture record deep link는 물리 ID 대신 PLAN/PRODUCTION view를 정본으로 사용한다. */
  if (entry.relation === "architectures") {
    const architecture = entry.record as Architecture;
    const view = architecture.type === "PLAN" ? "plan" : "current";
    return `/projects/${projectId}?type=architectures&view=${view}`;
  }

  return `/projects/${projectId}?type=${entry.relation}&id=${entry.record.id}`;
}

function useSearchShortcut(searchRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();

        /** Mobile header에서 숨긴 검색 input으로 focus가 이동하지 않게 한다. */
        if (window.innerWidth < 768) {
          return;
        }

        searchRef.current?.focus();
      }
    }

    document.addEventListener("keydown", focusSearch);
    return () => document.removeEventListener("keydown", focusSearch);
  }, [searchRef]);
}
export function ArtifactWorkbench({
  activeRelation,
  architectureView,
  context,
  projects,
  selectedArtifactId,
  selectedTaskId,
}: ArtifactWorkbenchProps) {
  const router = useRouter();
  const searchRef = useRef<HTMLInputElement>(null);
  const detailPaneDragStateRef = useRef<{
    pointerId: number;
    startRatio: number;
    startX: number;
  } | null>(null);
  const [requestRecords, setRequestRecords] = useState(context.requests);
  const allEntries = useMemo(
    () => getEntries(context, requestRecords),
    [context, requestRecords],
  );
  /** REST의 flat Domain 목록을 한 번만 안전한 계층으로 정규화한다. */
  const domainTree = useMemo(
    () => buildDomainTree(context.domains),
    [context.domains],
  );
  /** visible row마다 재구성하지 않도록 Wireframe lookup을 context 변경 시 한 번만 만든다. */
  const wireframesById = useMemo(
    () =>
      new Map(
        context.wireframes.map((wireframe) => [wireframe.id, wireframe]),
      ),
    [context.wireframes],
  );
  /** 펼친 Task 행의 부모 설명을 반복 탐색 없이 연결할 Plan lookup을 만든다. */
  const plansById = useMemo(
    () => new Map(context.plans.map((plan) => [plan.id, plan])),
    [context.plans],
  );
  /** URL view가 없으면 legacy ID 또는 Current 우선 규칙으로 최초 탭을 고른다. */
  const initialArchitectureView = getInitialArchitectureView(
    context.architectures,
    architectureView,
    selectedArtifactId,
  );
  const [selectedArchitectureView, setSelectedArchitectureView] =
    useState<ArchitectureView>(initialArchitectureView);
  const initialEntry = useMemo(() => {
    /** Domain은 명시적인 page ID가 없으면 첫 root를 자동 선택하지 않는다. */
    if (activeRelation === "domains") {
      if (selectedArtifactId === null) {
        return null;
      }

      return (
        allEntries.find(
          (entry) =>
            entry.relation === "domains" &&
            entry.record.id === selectedArtifactId,
        ) ?? null
      );
    }

    /** Architecture는 현재 view의 type과 명시 ID가 모두 일치할 때만 선택한다. */
    if (activeRelation === "architectures") {
      const architecture =
        selectedArtifactId === null
          ? getArchitectureForView(
              context.architectures,
              initialArchitectureView,
            )
          : (context.architectures.find(
              (candidate) => candidate.id === selectedArtifactId,
            ) ?? null);

      return architecture &&
        getArchitectureView(architecture) === initialArchitectureView
        ? ({ record: architecture, relation: "architectures" } as const)
        : null;
    }

    if (activeRelation === "plans" && selectedTaskId) {
      return allEntries.find(
        (entry) =>
          entry.relation === "tasks" && entry.record.id === selectedTaskId,
      );
    }

    if (selectedArtifactId) {
      return allEntries.find(
        (entry) =>
          entry.relation === activeRelation &&
          entry.record.id === selectedArtifactId,
      );
    }

    const activeEntry = allEntries.find(
      (entry) => entry.relation === activeRelation,
    );

    /** 독립 workspace가 비었으면 다른 도메인의 record를 detail fallback으로 사용하지 않는다. */
    return keepsEmptySelection(activeRelation)
      ? (activeEntry ?? null)
      : (activeEntry ?? allEntries[0]);
  }, [
    activeRelation,
    allEntries,
    context.architectures,
    initialArchitectureView,
    selectedArtifactId,
    selectedTaskId,
  ]);
  const selectedDomainAncestorIds = useMemo(
    () =>
      activeRelation === "domains" &&
      selectedArtifactId !== null &&
      domainTree.nodes.has(selectedArtifactId)
        ? getDomainAncestorIds(domainTree, selectedArtifactId)
        : [],
    [activeRelation, domainTree, selectedArtifactId],
  );
  const externalSelectionKey = [
    activeRelation,
    initialArchitectureView,
    selectedArtifactId ?? "none",
    selectedTaskId ?? "none",
    initialEntry ? getEntryKey(initialEntry) : "missing",
    selectedDomainAncestorIds.join(","),
  ].join(":");
  const [typeFilter, setTypeFilter] =
    useState<WorkbenchRelation>(activeRelation);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [versionFilter, setVersionFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialEntry ? getEntryKey(initialEntry) : null,
  );
  const [lastExternalSelectionKey, setLastExternalSelectionKey] =
    useState(externalSelectionKey);
  const [expandedPlanIds, setExpandedPlanIds] = useState<ReadonlySet<number>>(
    () =>
      getInitialExpandedPlanIds(
        activeRelation,
        context,
        selectedArtifactId,
        selectedTaskId,
      ),
  );
  const [expandedDomainIds, setExpandedDomainIds] = useState<
    ReadonlySet<number>
  >(() =>
    activeRelation === "domains" && selectedArtifactId !== null
      ? new Set(getDomainAncestorIds(domainTree, selectedArtifactId))
      : new Set(),
  );
  const [domainNotFoundId, setDomainNotFoundId] = useState<number | null>(() =>
    activeRelation === "domains" &&
    selectedArtifactId !== null &&
    !domainTree.nodes.has(selectedArtifactId)
      ? selectedArtifactId
      : null,
  );
  const [focusedDomainId, setFocusedDomainId] = useState<number | null>(() =>
    activeRelation === "domains" &&
    selectedArtifactId !== null &&
    domainTree.nodes.has(selectedArtifactId)
      ? selectedArtifactId
      : (domainTree.rootIds[0] ?? null),
  );
  const [searchCollapsedDomainIds, setSearchCollapsedDomainIds] = useState<{
    ids: ReadonlySet<number>;
    query: string;
  }>({ ids: new Set(), query: "" });
  const [mobilePane, setMobilePane] = useState<MobilePane>("records");
  const [isDetailPaneOpen, setIsDetailPaneOpen] = useState(true);
  const [detailPaneRatio, setDetailPaneRatio] = useState(
    defaultDetailPaneRatio,
  );
  const [isHtmlMetadataCollapsed, setIsHtmlMetadataCollapsed] = useState(false);
  const [previewViewport, setPreviewViewport] =
    useState<PreviewViewportMode>("desktop");
  const [requestEditorMode, setRequestEditorMode] =
    useState<RequestEditorMode | null>(null);

  /** 같은 project mount에서 URL query가 바뀌어도 선택·not-found·조상 확장을 즉시 동기화한다. */
  if (lastExternalSelectionKey !== externalSelectionKey) {
    const validDomainId =
      activeRelation === "domains" &&
      selectedArtifactId !== null &&
      domainTree.nodes.has(selectedArtifactId)
        ? selectedArtifactId
        : null;

    setLastExternalSelectionKey(externalSelectionKey);
    setTypeFilter(activeRelation);
    setSelectedArchitectureView(initialArchitectureView);
    setSelectedKey(initialEntry ? getEntryKey(initialEntry) : null);
    setDomainNotFoundId(
      activeRelation === "domains" &&
        selectedArtifactId !== null &&
        validDomainId === null
        ? selectedArtifactId
        : null,
    );
    setFocusedDomainId(validDomainId ?? domainTree.rootIds[0] ?? null);
    if (validDomainId !== null) {
      setExpandedDomainIds((currentIds) =>
        new Set([...currentIds, ...selectedDomainAncestorIds]),
      );
    }
  }

  useSearchShortcut(searchRef);

  const matchedSelectedEntry = allEntries.find(
    (entry) => getEntryKey(entry) === selectedKey,
  );
  const selectedEntry =
    matchedSelectedEntry ??
    (selectedKey === null || keepsEmptySelection(typeFilter)
      ? null
      : (allEntries[0] ?? null));
  const selectedStatus = selectedEntry
    ? getStatus(selectedEntry)
    : null;
  const selectedHtmlArtifact = selectedEntry
    ? getHtmlSelection(selectedEntry)
    : null;
  /** Architecture 선택에서만 canonical deployment graph preview에 원본 레코드를 제공한다. */
  const selectedArchitecture =
    selectedEntry?.relation === "architectures"
      ? (selectedEntry.record as Architecture)
      : null;
  /** PLAN은 문서/HTML, PRODUCTION은 deployment graph renderer로 분리한다. */
  const selectedArchitecturePlan =
    selectedArchitecture?.type === "PLAN" ? selectedArchitecture : null;
  const selectedProductionArchitecture =
    selectedArchitecture?.type === "PRODUCTION" ? selectedArchitecture : null;
  const selectedErd =
    selectedEntry?.relation === "erds"
      ? (selectedEntry.record as Erd)
      : null;
  const hasVisualPreview =
    selectedHtmlArtifact !== null ||
    selectedProductionArchitecture !== null ||
    selectedErd !== null;
  const isVisualMetadataCollapsed =
    selectedHtmlArtifact !== null && isHtmlMetadataCollapsed;
  /** Wireframe 전용 metadata만 노출하도록 relation을 확인한 뒤 record를 좁힌다. */
  const selectedWireframe =
    selectedEntry?.relation === "wireframes"
      ? (selectedEntry.record as Wireframe)
      : null;
  /** Request 선택에서만 편집 진입점을 노출한다. */
  const selectedRequest =
    selectedEntry?.relation === "requests"
      ? (selectedEntry.record as Request)
      : null;
  const selectedDomain =
    selectedEntry?.relation === "domains"
      ? (selectedEntry.record as Domain)
      : null;
  const selectedDomainNode = selectedDomain
    ? (domainTree.nodes.get(selectedDomain.id) ?? null)
    : null;
  const selectedDomainParent = selectedDomainNode?.parentId
    ? (domainTree.nodes.get(selectedDomainNode.parentId)?.domain ?? null)
    : null;
  const selectedDomainChildren = selectedDomainNode
    ? selectedDomainNode.childIds.flatMap((childId) => {
        const child = domainTree.nodes.get(childId)?.domain;
        return child ? [child] : [];
      })
    : [];
  const selectedDomainBreadcrumb = selectedDomain
    ? [
        ...getDomainAncestorIds(domainTree, selectedDomain.id).flatMap(
          (ancestorId) => {
            const ancestor = domainTree.nodes.get(ancestorId)?.domain;
            return ancestor ? [ancestor] : [];
          },
        ),
        selectedDomain,
      ]
    : [];
  const isWireframeView = typeFilter === "wireframes";
  const isVersionFilteredView = typeFilter === "wireframes";
  /** 현재 relation에 실제 존재하는 고유 version만 최신순으로 제공한다. */
  const availableVersions = useMemo(() => {
    const versions = typeFilter === "wireframes"
      ? context.wireframes.map((wireframe) => wireframe.version)
      : [];

    return [...new Set(versions)].sort((left, right) => right - left);
  }, [context.wireframes, typeFilter]);
  /** Version relation은 유효한 현재 선택을 보존하고 없거나 stale하면 실제 최신 version을 기본값으로 사용한다. */
  const effectiveVersionFilter =
    isVersionFilteredView
      ? versionFilter !== null && availableVersions.includes(versionFilter)
        ? versionFilter
        : (availableVersions[0] ?? null)
      : versionFilter;
  const isRequestView = typeFilter === "requests";
  const isDomainView = typeFilter === "domains";
  const isResearchView = typeFilter === "research";
  const isReviewView = typeFilter === "reviews";
  /** 명시한 Research ID가 없으면 최신 record로 조용히 대체하지 않는다. */
  const isResearchNotFound =
    activeRelation === "research" &&
    selectedArtifactId !== null &&
    (initialEntry === null || initialEntry === undefined);
  /** 명시한 Review ID가 없으면 다른 relation record로 대체하지 않는다. */
  const isReviewNotFound =
    activeRelation === "reviews" &&
    selectedArtifactId !== null &&
    (initialEntry === null || initialEntry === undefined);
  const isArchitectureView = typeFilter === "architectures";
  /** 명시한 Architecture ID가 현재 type과 맞지 않으면 다른 record로 대체하지 않는다. */
  const isArchitectureNotFound =
    activeRelation === "architectures" &&
    selectedArtifactId !== null &&
    initialEntry === null;
  /** 수정 중인 record는 성공 응답으로 교체된 로컬 Request 목록에서 읽는다. */
  const editorRequest =
    requestEditorMode?.type === "update"
      ? (requestRecords.find(
          (request) => request.id === requestEditorMode.requestId,
        ) ?? null)
      : null;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const domainSearchIds = useMemo(
    () => getDomainSearchIds(domainTree, normalizedQuery),
    [domainTree, normalizedQuery],
  );
  const autoExpandedSearchDomainIds = useMemo(() => {
    if (!normalizedQuery) {
      return new Set<number>();
    }

    const expandedIds = new Set<number>();
    for (const domainId of domainSearchIds) {
      const node = domainTree.nodes.get(domainId);
      if (node?.childIds.some((childId) => domainSearchIds.has(childId))) {
        expandedIds.add(domainId);
      }
    }
    return expandedIds;
  }, [domainSearchIds, domainTree, normalizedQuery]);
  const effectiveExpandedDomainIds = useMemo(() => {
    const expandedIds = new Set(expandedDomainIds);
    if (!normalizedQuery) {
      return expandedIds;
    }

    for (const domainId of autoExpandedSearchDomainIds) {
      expandedIds.add(domainId);
    }
    if (searchCollapsedDomainIds.query === normalizedQuery) {
      for (const domainId of searchCollapsedDomainIds.ids) {
        expandedIds.delete(domainId);
      }
    }
    return expandedIds;
  }, [
    autoExpandedSearchDomainIds,
    expandedDomainIds,
    normalizedQuery,
    searchCollapsedDomainIds,
  ]);
  const visibleDomainRows = useMemo(
    () =>
      flattenDomainTree(
        domainTree,
        effectiveExpandedDomainIds,
        normalizedQuery ? domainSearchIds : undefined,
      ),
    [
      domainSearchIds,
      domainTree,
      effectiveExpandedDomainIds,
      normalizedQuery,
    ],
  );
  const domainRowsById = useMemo(
    () =>
      new Map<number, DomainTreeRow>(
        visibleDomainRows.map((row) => [row.domain.id, row]),
      ),
    [visibleDomainRows],
  );
  const tabbableDomainId =
    focusedDomainId !== null && domainRowsById.has(focusedDomainId)
      ? focusedDomainId
      : selectedDomain && domainRowsById.has(selectedDomain.id)
        ? selectedDomain.id
        : (visibleDomainRows[0]?.domain.id ?? null);

  /** 현재 status/version/query 조합에 단일 record가 일치하는지 판별한다. */
  function matchesVisibleFilters(entry: WorkbenchEntry): boolean {
    const config = relationConfig[entry.relation];
    /** Version relation에는 숨겨진 status filter 대신 선택한 version만 적용한다. */
    const matchesRecordFilter =
      entry.relation === "wireframes"
        ? effectiveVersionFilter === null ||
          (entry.record as Wireframe).version === effectiveVersionFilter
        : statusFilter === "All" || getStatus(entry) === statusFilter;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [
        entry.record.title,
        entry.record.id,
        config.label,
        entry.relation === "wireframes"
          ? (entry.record as Wireframe).index
          : null,
      ]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);

    return matchesRecordFilter && matchesQuery;
  }

  /** Plan 목록에는 펼친 Plan의 필터 일치 Task를 부모 바로 다음 행으로 삽입한다. */
  const filteredEntries = allEntries
    .filter((entry) => entry.relation === typeFilter)
    .flatMap((entry) => {
      /** Architecture 중앙 목록에는 선택한 Plan 또는 Current record만 노출한다. */
      if (entry.relation === "architectures") {
        const architecture = entry.record as Architecture;
        return getArchitectureView(architecture) === selectedArchitectureView &&
          matchesVisibleFilters(entry)
          ? [entry]
          : [];
      }

      if (entry.relation !== "plans") {
        return matchesVisibleFilters(entry) ? [entry] : [];
      }

      const plan = entry.record as Plan;
      const isExpanded = expandedPlanIds.has(plan.id);
      const visibleTasks = isExpanded
        ? plan.tasks
            .map(
              (record): WorkbenchEntry => ({ record, relation: "tasks" }),
            )
            .filter(matchesVisibleFilters)
        : [];
      const isPlanVisible =
        matchesVisibleFilters(entry) || visibleTasks.length > 0;

      return isPlanVisible ? [entry, ...visibleTasks] : [];
    });
  const visibleEntries = isDomainView
    ? visibleDomainRows.map(
        (row): WorkbenchEntry => ({
          record: row.domain,
          relation: "domains",
        }),
      )
    : filteredEntries;
  const currentRepository = context.repoPaths[0];
  const repositoryPath = currentRepository?.path ?? "No repository connected";

  /** Plan은 계층을 토글하고, 모든 record는 선택 deep link와 detail pane을 갱신한다. */
  function selectEntry(entry: WorkbenchEntry) {
    setRequestEditorMode(null);
    setIsHtmlMetadataCollapsed(false);
    setSelectedKey(getEntryKey(entry));
    setDomainNotFoundId(null);
    setIsDetailPaneOpen(true);
    setMobilePane("detail");

    /** Plan 재선택은 같은 목록에서 해당 Task 행만 펼치거나 접는다. */
    if (entry.relation === "plans") {
      setExpandedPlanIds((currentPlanIds) => {
        const nextPlanIds = new Set(currentPlanIds);

        if (nextPlanIds.has(entry.record.id)) {
          nextPlanIds.delete(entry.record.id);
        } else {
          nextPlanIds.add(entry.record.id);
        }

        return nextPlanIds;
      });
    }

    /** Domain 선택은 조상 경로를 보존하고 child가 있는 현재 행을 함께 토글한다. */
    if (entry.relation === "domains") {
      const domainId = entry.record.id;
      setFocusedDomainId(domainId);
      setExpandedDomainIds((currentDomainIds) => {
        const nextDomainIds = new Set(currentDomainIds);
        const node = domainTree.nodes.get(domainId);

        for (const ancestorId of getDomainAncestorIds(domainTree, domainId)) {
          nextDomainIds.add(ancestorId);
        }

        if (node && node.childIds.length > 0) {
          if (nextDomainIds.has(domainId)) {
            nextDomainIds.delete(domainId);
          } else {
            nextDomainIds.add(domainId);
          }
        }

        return nextDomainIds;
      });
    }

    router.replace(getRelationHref(entry, context.id), { scroll: false });
  }

  /** 중앙 Architecture 탭을 바꾸고 해당 type의 단일 record와 canonical URL을 동기화한다. */
  function selectArchitectureView(view: ArchitectureView) {
    const architecture = getArchitectureForView(context.architectures, view);

    setSelectedArchitectureView(view);
    setSelectedKey(
      architecture
        ? getEntryKey({ record: architecture, relation: "architectures" })
        : null,
    );
    setIsHtmlMetadataCollapsed(false);
    setRequestEditorMode(null);
    setIsDetailPaneOpen(true);
    router.replace(
      `/projects/${context.id}?type=architectures&view=${view}`,
      { scroll: false },
    );
  }

  /** 좌측 section 항목을 선택하고 relation·Architecture view·URL을 하나의 상태로 맞춘다. */
  function selectNavigationItem(item: NavigationItemDescriptor) {
    const relationEntries = allEntries.filter(
      (entry) => entry.relation === item.relation,
    );

    setTypeFilter(item.relation);
    setDomainNotFoundId(null);
    setVersionFilter(null);
    setMobilePane("records");
    setStatusFilter("All");
    setRequestEditorMode(null);

    /** Architecture 진입점은 그룹별 PLAN/PRODUCTION view와 canonical URL을 직접 선택한다. */
    if (item.relation === "architectures" && item.architectureView) {
      const architecture = getArchitectureForView(
        context.architectures,
        item.architectureView,
      );

      setSelectedArchitectureView(item.architectureView);
      setSelectedKey(
        architecture
          ? getEntryKey({ record: architecture, relation: "architectures" })
          : null,
      );
      router.replace(
        `/projects/${context.id}?type=architectures&view=${item.architectureView}`,
        { scroll: false },
      );
      return;
    }

    /** Relation 전환 시 해당 relation의 첫 record만 선택해 교차 relation detail fallback을 차단한다. */
    const firstEntry = relationEntries[0] ?? null;
    setSelectedKey(
      item.relation === "domains" || firstEntry === null
        ? null
        : getEntryKey(firstEntry),
    );
    router.replace(`/projects/${context.id}?type=${item.relation}`, {
      scroll: false,
    });
  }

  /** Architecture 탭은 수평 방향키와 Home/End로 선택과 focus를 함께 이동한다. */
  function handleArchitectureViewKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    view: ArchitectureView,
  ) {
    let nextView: ArchitectureView | null = null;

    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      nextView = view === "plan" ? "current" : "plan";
    } else if (event.key === "Home") {
      nextView = "plan";
    } else if (event.key === "End") {
      nextView = "current";
    }

    if (!nextView) {
      return;
    }

    event.preventDefault();
    const tabs = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      ) ?? [],
    );
    tabs[nextView === "plan" ? 0 : 1]?.focus();
    selectArchitectureView(nextView);
  }

  /** Domain treeitem의 좌우 방향키로 현재 branch를 펼치거나 접는다. */
  function handleDomainTreeKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    row: DomainTreeRow,
  ) {
    const treeItems = Array.from(
      event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        '[role="treeitem"]',
      ) ?? [],
    );
    const currentIndex = treeItems.indexOf(event.currentTarget);
    const isEffectivelyExpanded = effectiveExpandedDomainIds.has(
      row.domain.id,
    );

    if (
      event.key === "ArrowDown" ||
      event.key === "ArrowUp" ||
      event.key === "Home" ||
      event.key === "End"
    ) {
      const targetIndex =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? treeItems.length - 1
            : event.key === "ArrowDown"
              ? Math.min(currentIndex + 1, treeItems.length - 1)
              : Math.max(currentIndex - 1, 0);

      event.preventDefault();
      treeItems[targetIndex]?.focus();
      return;
    }

    if (event.key === "ArrowRight") {
      if (row.childIds.length === 0) {
        return;
      }

      event.preventDefault();
      if (!isEffectivelyExpanded) {
        if (normalizedQuery) {
          setSearchCollapsedDomainIds((current) => {
            const nextIds =
              current.query === normalizedQuery
                ? new Set(current.ids)
                : new Set<number>();
            nextIds.delete(row.domain.id);
            return { ids: nextIds, query: normalizedQuery };
          });
        } else {
          setExpandedDomainIds((currentIds) =>
            new Set([...currentIds, row.domain.id]),
          );
        }
      } else {
        treeItems[currentIndex + 1]?.focus();
      }
      return;
    }

    if (event.key === "ArrowLeft" && isEffectivelyExpanded) {
      event.preventDefault();
      if (normalizedQuery) {
        setSearchCollapsedDomainIds((current) => {
          const nextIds =
            current.query === normalizedQuery
              ? new Set(current.ids)
              : new Set<number>();
          nextIds.add(row.domain.id);
          return { ids: nextIds, query: normalizedQuery };
        });
      } else {
        setExpandedDomainIds((currentIds) => {
          const nextIds = new Set(currentIds);
          nextIds.delete(row.domain.id);
          return nextIds;
        });
      }
      return;
    }

    if (event.key === "ArrowLeft" && row.parentId !== null) {
      const parentIndex = treeItems.findLastIndex(
        (item, index) =>
          index < currentIndex &&
          Number(item.getAttribute("aria-level")) === row.depth,
      );

      if (parentIndex >= 0) {
        event.preventDefault();
        treeItems[parentIndex]?.focus();
      }
    }
  }

  /** 모바일 pane 전환 중 Info 선택만 닫힌 detail pane을 다시 연다. */
  function selectMobilePane(pane: MobilePane) {
    if (pane === "detail") {
      setIsDetailPaneOpen(true);
    }
    setMobilePane(pane);
  }

  /** 선택 record와 resize 비율은 보존하고 detail pane만 닫는다. */
  function closeDetailPane() {
    setRequestEditorMode(null);
    setIsDetailPaneOpen(false);
    setMobilePane("records");
  }

  /** 빈 목록에서도 Request 생성 form을 detail surface에 연다. */
  function openRequestCreator() {
    setRequestEditorMode({ type: "create" });
    setIsDetailPaneOpen(true);
    setMobilePane("detail");
  }

  /** 선택한 Request record의 현재 문서와 상태로 수정 form을 연다. */
  function openRequestEditor(request: Request) {
    setRequestEditorMode({ type: "update", requestId: request.id });
    setIsDetailPaneOpen(true);
    setMobilePane("detail");
  }

  /** 저장 성공 record만 목록에 반영하고 선택 URL과 Server data를 갱신한다. */
  function saveRequestRecord(savedRequest: Request) {
    setRequestRecords((currentRequests) => {
      const requestExists = currentRequests.some(
        (request) => request.id === savedRequest.id,
      );

      /** 생성 record는 최신 목록 앞에, 수정 record는 기존 위치에 반영한다. */
      return requestExists
        ? currentRequests.map((request) =>
            request.id === savedRequest.id ? savedRequest : request,
          )
        : [savedRequest, ...currentRequests];
    });
    setSelectedKey(`requests-${savedRequest.id}`);
    setStatusFilter("All");
    setRequestEditorMode(null);
    setIsDetailPaneOpen(true);
    router.replace(
      `/projects/${context.id}?type=requests&id=${savedRequest.id}`,
      { scroll: false },
    );
    router.refresh();
  }

  /** 명시된 id를 먼저, index를 다음으로 해석해 기존 record 선택 흐름을 재사용한다. */
  function navigateToWireframe(target: HtmlPreviewWireframeNavigation) {
    const numericId = target.wireframeId
      ? Number(target.wireframeId)
      : Number.NaN;
    const wireframeById = Number.isSafeInteger(numericId)
      ? context.wireframes.find((wireframe) => wireframe.id === numericId)
      : undefined;
    const wireframe =
      wireframeById ??
      (target.wireframeIndex
        ? context.wireframes.find(
            (candidate) => candidate.index === target.wireframeIndex,
          )
        : undefined);

    /** 해석할 형제 record가 없으면 현재 선택과 URL을 그대로 유지한다. */
    if (!wireframe) {
      return;
    }

    selectEntry({ record: wireframe, relation: "wireframes" });
  }

  /** iframe 내부 scroll이 임계값을 넘으면 Metadata를 접고 최상단에서 복원한다. */
  function updateHtmlPreviewScrollState(scrollTop: number) {
    setIsHtmlMetadataCollapsed(scrollTop > metadataCollapseScrollThreshold);
  }

  /** Detail pane의 viewport 점유 비율을 15~70% 범위에서 갱신한다. */
  function resizeDetailPaneTo(ratio: number) {
    setDetailPaneRatio(clampDetailPaneRatio(ratio));
  }

  /** Primary pointer drag 시작 좌표와 현재 폭을 저장하고 capture를 건다. */
  function handleDetailPanePointerDown(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (event.button !== 0) return;

    event.preventDefault();
    detailPaneDragStateRef.current = {
      pointerId: event.pointerId,
      startRatio: detailPaneRatio,
      startX: event.clientX,
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  /** Pointer 이동 거리를 현재 viewport 대비 percentage point로 환산한다. */
  function handleDetailPanePointerMove(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    const dragState = detailPaneDragStateRef.current;

    if (!dragState || dragState.pointerId !== event.pointerId) return;
    if (window.innerWidth <= 0) return;

    const ratioDelta =
      ((dragState.startX - event.clientX) / window.innerWidth) * 100;
    resizeDetailPaneTo(dragState.startRatio + ratioDelta);
  }

  /** 완료·취소·capture 상실 시 현재 pointer drag를 정리한다. */
  function finishDetailPanePointerResize(
    event: ReactPointerEvent<HTMLDivElement>,
  ) {
    if (detailPaneDragStateRef.current?.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    detailPaneDragStateRef.current = null;
  }

  /** Vertical separator의 방향키 입력을 2 percentage point 변화로 변환한다. */
  function handleDetailPaneResizeKeyDown(
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeDetailPaneTo(detailPaneRatio + detailPaneResizeStep);
      return;
    }

    if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeDetailPaneTo(detailPaneRatio - detailPaneResizeStep);
    }
  }

  /** Viewport root가 detail pane 비율을 참조하도록 component-local CSS 변수를 주입한다. */
  const viewportLayoutStyle = {
    "--detail-pane-width": `${detailPaneRatio}%`,
  } as CSSProperties;
  return (
    <div
      className={`group/workbench grid h-dvh min-h-dvh w-screen min-w-0 max-w-full grid-rows-[58px_minmax(0,1fr)] overflow-hidden bg-canvas max-md:h-dvh`}
      data-mobile-pane={mobilePane}
      style={viewportLayoutStyle}
    >
      <header className="relative z-40 flex min-w-0 items-center gap-2 overflow-visible border-b border-sidebar-line bg-sidebar px-2 text-sidebar-ink shadow-card sm:gap-4 sm:px-4">
        <div className="min-w-0 flex-1 md:w-[250px] md:flex-none">
          <ProjectPicker currentProjectId={context.id} projects={projects} />
        </div>

        <label className="relative hidden min-w-0 max-w-[680px] flex-1 md:block">
          <span className="sr-only">Search records</span>
          <span
            aria-hidden="true"
            className="absolute top-[9px] left-3 text-sidebar-subtle"
          >
            ⌕
          </span>
          <input
            ref={searchRef}
            aria-label="Search records"
            className="h-9 w-full rounded-control border border-sidebar-line bg-sidebar-hover pr-[90px] pl-9 text-[13px] text-sidebar-ink placeholder:text-sidebar-subtle focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none max-md:pr-3"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setQuery("");
                event.currentTarget.blur();
              }
            }}
            placeholder={
              isDomainView
                ? "Search Domain titles, Markdown, or IDs"
                : "Search titles, types, or IDs"
            }
            type="search"
            value={query}
          />
          <span className="absolute top-[7px] right-2 rounded-[5px] border border-sidebar-line px-1.5 py-[3px] font-mono text-[10px] text-sidebar-subtle max-md:hidden">
            ⌘ K
          </span>
        </label>

        <div className="ml-auto hidden min-w-0 items-center gap-2 font-mono text-[11px] text-sidebar-muted md:flex">
          <span
            aria-hidden="true"
            className="size-[7px] shrink-0 rounded-full bg-success ring-2 ring-success/15"
          />
          <span className="max-w-[18rem] truncate">{repositoryPath}</span>
        </div>

        <nav aria-label="Mobile panes" className="ml-auto flex shrink-0 gap-1 md:hidden">
          {[
            { id: "tree" as const, label: "Tree", ariaLabel: "Open tree" },
            {
              id: "records" as const,
              label: "List",
              ariaLabel: "Open records",
            },
            {
              id: "detail" as const,
              label: "Info",
              ariaLabel: "Open detail",
            },
          ].map((pane) => (
            <button
              key={pane.id}
              aria-label={pane.ariaLabel}
              aria-pressed={mobilePane === pane.id}
              className="min-h-11 min-w-11 rounded-control border border-sidebar-line bg-sidebar-hover px-2 text-[11px] font-semibold text-sidebar-muted aria-pressed:border-accent aria-pressed:bg-sidebar-selected aria-pressed:text-sidebar-ink focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none"
              onClick={() => selectMobilePane(pane.id)}
              type="button"
            >
              {pane.label}
            </button>
          ))}
        </nav>
      </header>

      <main
        className={`min-h-0 min-w-0 bg-surface md:grid ${
          isDetailPaneOpen
            ? "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)]"
            : "md:grid-cols-[230px_minmax(0,1fr)]"
        }`}
      >
        <aside
          aria-label="Project artifact tree"
          className={`${mobilePane === "tree" ? "flex" : "hidden"} min-h-[calc(100dvh-58px)] min-w-0 flex-col border-r border-sidebar-line bg-sidebar text-sidebar-ink md:flex md:min-h-0`}
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-sidebar-line px-3.5 py-2.5">
            <h2 className="m-0 text-xs font-semibold tracking-[0.08em] text-sidebar-muted uppercase">
              Explorer
            </h2>
            <span className="font-mono text-[11px] text-sidebar-subtle">
              {allEntries.length} records
            </span>
          </div>
          <div className="min-h-0 overflow-auto">
            <nav aria-label="Artifact types" className="px-2 pt-2 pb-3">
              {navigationSections.map((section) => {
                const headingId = `artifact-section-${section.id}`;

                return (
                  <section
                    aria-labelledby={headingId}
                    className="pb-2 last:pb-0"
                    key={section.id}
                    role="group"
                  >
                    <h3
                      className="m-0 px-2.5 py-2 font-mono text-[10px] tracking-[0.1em] text-sidebar-subtle uppercase"
                      id={headingId}
                    >
                      {section.label}
                    </h3>
                    {section.items.map((item) => {
                      const architectureView =
                        "architectureView" in item
                          ? item.architectureView
                          : undefined;
                      const architecture = architectureView
                        ? getArchitectureForView(
                            context.architectures,
                            architectureView,
                          )
                        : null;
                      /** Architecture 진입점은 각 type의 단일 record 존재 여부로 0|1을 표시한다. */
                      const count = architectureView
                        ? architecture
                          ? 1
                          : 0
                        : allEntries.filter(
                            (entry) => entry.relation === item.relation,
                          ).length;
                      const isActive = architectureView
                        ? typeFilter === "architectures" &&
                          selectedArchitectureView === architectureView
                        : typeFilter === item.relation;
                      return (
                        <button
                          aria-label={`${item.label} ${count}`}
                          aria-pressed={isActive}
                          className="flex min-h-11 w-full items-center gap-[9px] rounded-control border-0 bg-transparent px-[9px] py-[7px] text-left text-[13px] text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-ink aria-pressed:bg-sidebar-selected aria-pressed:text-sidebar-ink aria-pressed:shadow-[inset_3px_0_var(--color-accent)] focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none"
                          key={item.id}
                          onClick={() => selectNavigationItem(item)}
                          type="button"
                        >
                          <span
                            aria-hidden="true"
                            className="w-[18px] text-center font-mono text-[11px] text-sidebar-subtle"
                          >
                            {item.code}
                          </span>
                          <span className="flex-1">{item.label}</span>
                          <span className="font-mono text-[10px] text-sidebar-subtle">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </section>
                );
              })}
            </nav>
          </div>
        </aside>

        <section
          aria-labelledby="records-heading"
          className={`${mobilePane === "records" ? "flex" : "hidden"} min-h-[calc(100dvh-58px)] min-w-0 max-w-full flex-col overflow-hidden border-r border-line bg-surface md:flex md:min-h-0`}
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
            <div>
              <button
                className="mr-2 inline-flex h-9 items-center rounded-control border border-line bg-surface px-2.5 text-muted md:hidden"
                onClick={() => setMobilePane("tree")}
                type="button"
              >
                ← Tree
              </button>
              <h2
                id="records-heading"
                className="m-0 inline text-sm font-semibold tracking-[0.04em] text-ink uppercase"
              >
                Records
              </h2>
            </div>
            <div className="flex items-center gap-3">
              <span
                aria-live="polite"
                className="font-mono text-[11px] text-subtle"
              >
                {visibleEntries.length} visible
              </span>
              {isRequestView ? (
                <button
                  className="min-h-11 rounded-control bg-primary px-3 text-xs font-semibold text-surface hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:outline-none"
                  onClick={openRequestCreator}
                  type="button"
                >
                  New request
                </button>
              ) : null}
            </div>
          </div>
          {isArchitectureView ? (
            <div
              aria-label="Architecture views"
              className="flex min-h-11 items-end gap-1 border-b border-line bg-surface px-4"
              role="tablist"
            >
              <button
                aria-controls="architecture-records"
                aria-selected={selectedArchitectureView === "plan"}
                className="min-h-11 border-0 border-b-2 border-transparent bg-transparent px-3 text-xs font-semibold text-muted hover:text-ink aria-selected:border-accent aria-selected:text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                onClick={() => selectArchitectureView("plan")}
                onKeyDown={(event) =>
                  handleArchitectureViewKeyDown(event, "plan")
                }
                role="tab"
                tabIndex={selectedArchitectureView === "plan" ? 0 : -1}
                type="button"
              >
                Plan
              </button>
              <button
                aria-controls="architecture-records"
                aria-selected={selectedArchitectureView === "current"}
                className="min-h-11 border-0 border-b-2 border-transparent bg-transparent px-3 text-xs font-semibold text-muted hover:text-ink aria-selected:border-accent aria-selected:text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                onClick={() => selectArchitectureView("current")}
                onKeyDown={(event) =>
                  handleArchitectureViewKeyDown(event, "current")
                }
                role="tab"
                tabIndex={selectedArchitectureView === "current" ? 0 : -1}
                type="button"
              >
                Current
              </button>
            </div>
          ) : null}
          <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
              {context.title} /{" "}
              <strong>{relationConfig[typeFilter].plural}</strong>
            </span>
            {isArchitectureView ? (
              <span className="font-mono text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                {selectedArchitectureView === "plan"
                  ? "Architecture plan"
                  : "Production snapshot"}
              </span>
            ) : isDomainView ? (
              <span className="font-mono text-[10px] font-semibold tracking-[0.06em] text-muted uppercase">
                Read-only hierarchy
              </span>
            ) : isVersionFilteredView ? (
              <label>
                <span className="sr-only">Version</span>
                <select
                  aria-label="Version"
                  className="h-[34px] rounded-control border border-line-strong bg-surface pr-7 pl-2.5 text-xs text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onChange={(event) =>
                    setVersionFilter(Number(event.target.value))
                  }
                  value={effectiveVersionFilter ?? ""}
                >
                  {availableVersions.map((version) => (
                    <option key={version} value={version}>
                      v{version}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label>
                <span className="sr-only">Status</span>
                <select
                  aria-label="Status"
                  className="h-[34px] rounded-control border border-line-strong bg-surface pr-7 pl-2.5 text-xs text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onChange={(event) =>
                    setStatusFilter(event.target.value as StatusFilter)
                  }
                  value={statusFilter}
                >
                  <option value="All">All status</option>
                  <option value="Completed">Completed</option>
                  <option value="In progress">In progress</option>
                  <option value="Pending">Pending</option>
                </select>
              </label>
            )}
          </div>
          <div
            className="m-3 min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface shadow-card"
            id={isArchitectureView ? "architecture-records" : undefined}
          >
            <div
              aria-hidden="true"
              className={`sticky top-0 z-10 grid h-9 items-center gap-3 border-b border-line bg-surface-muted px-4 font-mono text-[10px] font-semibold tracking-[0.06em] text-muted uppercase ${isWireframeView ? "min-w-[650px] grid-cols-[88px_52px_72px_minmax(180px,1fr)_180px]" : "min-w-[740px] grid-cols-[88px_52px_minmax(180px,1fr)_96px_52px_180px]"}`}
            >
              <span>Type</span>
              <span>No</span>
              {isWireframeView ? (
                <>
                  <span>Index</span>
                  <span>Title</span>
                  <span>Updated</span>
                </>
              ) : (
                <>
                  <span>Title</span>
                  <span>Status</span>
                  <span>Links</span>
                  <span>Updated</span>
                </>
              )}
            </div>
            <div
              aria-label={
                isDomainView ? "Domain hierarchy" : "Artifact records"
              }
              role={isDomainView ? "tree" : "listbox"}
            >
              {visibleEntries.map((entry) => {
                const config = relationConfig[entry.relation];
                const status = getStatus(entry);
                const entryRelations = getRelations(entry, context);
                const secondaryMeta = getEntrySecondaryMeta(entry, context);
                const isSelected = getEntryKey(entry) === selectedKey;
                const updatedAt = formatDashboardDate(entry.record.updatedAt);
                const wireframe =
                  entry.relation === "wireframes"
                    ? (entry.record as Wireframe)
                    : null;
                const plan =
                  entry.relation === "plans" ? (entry.record as Plan) : null;
                const isPlanExpanded = plan
                  ? expandedPlanIds.has(plan.id)
                  : null;
                const parentPlan =
                  entry.relation === "tasks"
                    ? (plansById.get((entry.record as Task).planId) ?? null)
                    : null;
                const domainRow =
                  entry.relation === "domains"
                    ? (domainRowsById.get(entry.record.id) ?? null)
                    : null;
                const isDomainExpanded = domainRow
                  ? effectiveExpandedDomainIds.has(domainRow.domain.id)
                  : false;
                const domainParent = domainRow?.parentId
                  ? (domainTree.nodes.get(domainRow.parentId)?.domain ?? null)
                  : null;
                /** 시각적 header가 숨겨져도 각 option에서 전체 칼럼 의미를 전달한다. */
                const accessibleName = domainRow
                  ? [
                      `Domain ${domainRow.domain.title}`,
                      `No ${domainRow.domain.id}`,
                      `Level ${domainRow.depth + 1}`,
                      domainParent
                        ? `Parent ${domainParent.title}`
                        : "Root Domain",
                      domainRow.childIds.length > 0
                        ? `Children ${isDomainExpanded ? "expanded" : "collapsed"}`
                        : "No children",
                      domainRow.hierarchyIssue
                        ? `Hierarchy warning ${domainRow.hierarchyIssue}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(", ")
                  : wireframe
                  ? [
                      `Type ${config.label}`,
                      `No ${entry.record.id}`,
                      `Index ${wireframe.index}`,
                      `Title ${entry.record.title}`,
                      `Updated ${updatedAt}`,
                    ].join(", ")
                  : [
                      `Type ${config.label}`,
                      `No ${entry.record.id}`,
                      `Title ${entry.record.title}`,
                      `Status ${status ?? "None"}`,
                      `Links ${entryRelations.length}`,
                      `Updated ${updatedAt}`,
                      ...(isPlanExpanded === null
                        ? []
                        : [
                            `Tasks ${isPlanExpanded ? "expanded" : "collapsed"}`,
                          ]),
                    ].join(", ");
                const wireframeHierarchy = getWireframeHierarchy(
                  entry,
                  wireframesById,
                );

                return (
                  <button
                    key={getEntryKey(entry)}
                    aria-describedby={
                      parentPlan
                        ? `plan-task-parent-${entry.record.id}`
                        : wireframeHierarchy?.parent
                        ? `wireframe-parent-${entry.record.id}`
                        : undefined
                    }
                    aria-label={accessibleName}
                    aria-selected={isSelected}
                    aria-expanded={
                      domainRow && domainRow.childIds.length > 0
                        ? isDomainExpanded
                        : undefined
                    }
                    aria-level={domainRow ? domainRow.depth + 1 : undefined}
                    aria-posinset={domainRow?.positionInSet}
                    aria-setsize={domainRow?.setSize}
                    className={`grid min-h-14 w-full items-center gap-3 border-0 border-b border-line bg-surface px-4 text-left text-ink transition-colors hover:bg-hover aria-selected:bg-selected aria-selected:shadow-[inset_3px_0_var(--color-accent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none ${wireframe ? "min-w-[650px] grid-cols-[88px_52px_72px_minmax(180px,1fr)_180px]" : "min-w-[740px] grid-cols-[88px_52px_minmax(180px,1fr)_96px_52px_180px]"}`}
                    data-domain-id={domainRow?.domain.id}
                    onClick={() => selectEntry(entry)}
                    onFocus={
                      domainRow
                        ? () => setFocusedDomainId(domainRow.domain.id)
                        : undefined
                    }
                    onKeyDown={
                      domainRow
                        ? (event) => handleDomainTreeKeyDown(event, domainRow)
                        : undefined
                    }
                    data-plan-expanded={
                      isPlanExpanded === null
                        ? undefined
                        : String(isPlanExpanded)
                    }
                    role={domainRow ? "treeitem" : "option"}
                    tabIndex={
                      domainRow
                        ? domainRow.domain.id === tabbableDomainId
                          ? 0
                          : -1
                        : undefined
                    }
                    type="button"
                  >
                    <span className="inline-flex items-center gap-[7px] font-mono text-[10px] text-muted">
                      <span
                        aria-hidden="true"
                        className={`size-[7px] rounded-[2px] ${config.dotClassName}`}
                      />
                      {config.label}
                    </span>
                    <span className="font-mono text-[11px] text-subtle">
                      {entry.record.id}
                    </span>
                    {wireframe ? (
                      <span className="font-mono text-[11px] text-subtle">
                        {wireframe.index}
                      </span>
                    ) : null}
                    <span
                      className={
                        parentPlan
                          ? "relative min-w-0 pl-6"
                          : wireframeHierarchy?.depth === 1
                          ? "relative min-w-0 pl-4"
                          : domainRow
                            ? "relative min-w-0"
                            : "min-w-0"
                      }
                      data-domain-depth={domainRow?.depth}
                      data-plan-task-depth={parentPlan ? "1" : undefined}
                      data-wireframe-depth={wireframeHierarchy?.depth}
                      style={
                        domainRow
                          ? {
                              paddingInlineStart: `${domainRow.depth * 20}px`,
                            }
                          : undefined
                      }
                    >
                      {parentPlan ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute top-0 left-0 text-subtle"
                            data-plan-task-branch
                          >
                            └
                          </span>
                          <span
                            id={`plan-task-parent-${entry.record.id}`}
                            className="sr-only"
                          >
                            Parent Plan: {parentPlan.title}
                          </span>
                        </>
                      ) : null}
                      {wireframeHierarchy?.parent ? (
                        <>
                          <span
                            aria-hidden="true"
                            className="absolute top-0 left-0 text-subtle"
                            data-wireframe-branch
                          >
                            └
                          </span>
                          <span
                            id={`wireframe-parent-${entry.record.id}`}
                            className="sr-only"
                          >
                            Parent wireframe: {wireframeHierarchy.parent.title}
                          </span>
                        </>
                      ) : null}
                      <span className="flex min-w-0 items-center gap-1.5">
                        {domainRow ? (
                          <span
                            aria-hidden="true"
                            className="inline-block w-3 shrink-0 font-mono text-[11px] text-subtle"
                          >
                            {domainRow.childIds.length > 0
                              ? isDomainExpanded
                                ? "▾"
                                : "▸"
                              : "·"}
                          </span>
                        ) : null}
                        <strong className="block min-w-0 truncate text-[13px]">
                          {entry.record.title}
                        </strong>
                      </span>
                      {secondaryMeta ? (
                        <small className="mt-1 block truncate font-mono text-[10px] text-subtle">
                          {secondaryMeta}
                        </small>
                      ) : null}
                      {domainRow?.hierarchyIssue ? (
                        <small className="mt-1 block truncate font-mono text-[10px] text-danger">
                          Hierarchy warning: {domainRow.hierarchyIssue}
                        </small>
                      ) : null}
                    </span>
                    {!wireframe ? (
                      <>
                        <span
                          className={
                            status
                              ? getStatusClassName(status)
                              : "inline-flex w-max px-[7px] py-[3px] font-mono text-[10px] text-subtle"
                          }
                        >
                          {status ?? "—"}
                        </span>
                        <span className="font-mono text-[11px] text-subtle">
                          {entryRelations.length}
                        </span>
                      </>
                    ) : null}
                    <span className="truncate font-mono text-[10px] text-subtle">
                      {updatedAt}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {visibleEntries.length === 0 ? (
            <div className="px-6 py-14 text-center text-muted">
              <strong className="mb-1.5 block text-ink">
                {isArchitectureView
                  ? selectedArchitectureView === "plan"
                    ? "No Architecture Plan records"
                    : "No Current Architecture records"
                  : isResearchView && context.research.length === 0
                    ? "No Research records"
                  : isReviewView && context.reviews.length === 0
                    ? "No Review records"
                  : isDomainView && context.domains.length === 0
                  ? "No Domain pages"
                  : isDomainView
                    ? "No matching Domains"
                    : isRequestView && requestRecords.length === 0
                  ? "No Request records"
                  : "No matching records"}
              </strong>
              {isArchitectureView
                ? selectedArchitectureView === "plan"
                  ? "Save the implementation plan through the Architecture workflow."
                  : "Save a production deployment snapshot through the Architecture workflow."
                : isResearchView && context.research.length === 0
                  ? "Run the Research workflow to save verified findings and sources."
                : isReviewView && context.reviews.length === 0
                  ? "Run the Review workflow to assess the current project state."
                : isDomainView && context.domains.length === 0
                ? "Create business Domain pages through the Domain MCP workflow."
                : isDomainView
                  ? "Try another title, Markdown term, or Domain ID."
                  : isRequestView && requestRecords.length === 0
                    ? "Create a Request document to start tracking work."
                    : "Try another search or type filter."}
            </div>
          ) : null}
        </section>

        <aside
          aria-labelledby="detail-heading"
          className={`${isDetailPaneOpen && mobilePane === "detail" ? "flex" : "hidden"} relative h-full min-h-0 min-w-0 flex-col border-l border-line bg-surface ${isDetailPaneOpen ? "md:flex" : "md:hidden"}`}
        >
          <div
            aria-label="Resize detail pane"
            aria-orientation="vertical"
            aria-valuemax={maximumDetailPaneRatio}
            aria-valuemin={minimumDetailPaneRatio}
            aria-valuenow={detailPaneRatio}
            aria-valuetext={`${detailPaneRatio} percent of viewport`}
            className="group absolute inset-y-0 left-0 z-20 hidden w-3 touch-none cursor-col-resize items-center justify-center focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none md:flex"
            onKeyDown={handleDetailPaneResizeKeyDown}
            onLostPointerCapture={finishDetailPanePointerResize}
            onPointerCancel={finishDetailPanePointerResize}
            onPointerDown={handleDetailPanePointerDown}
            onPointerMove={handleDetailPanePointerMove}
            onPointerUp={finishDetailPanePointerResize}
            role="separator"
            tabIndex={0}
          >
            <span
              aria-hidden="true"
              className="h-14 w-0.5 rounded-full bg-line-strong transition-colors group-hover:bg-accent group-focus-visible:bg-accent motion-reduce:transition-none"
            />
          </div>

          <div className="flex h-[58px] shrink-0 items-center gap-3 border-b border-line bg-surface px-4 shadow-card">
            <button
              className="inline-flex h-9 items-center rounded-control border border-line bg-surface px-2.5 text-muted md:hidden"
              onClick={() => setMobilePane("records")}
              type="button"
            >
              ← List
            </button>
            <div className="min-w-0 flex-1">
              <h2
                id="detail-heading"
                className="m-0 truncate text-sm font-semibold tracking-[-0.01em] text-ink"
              >
                {requestEditorMode?.type === "create"
                  ? "New request"
                  : requestEditorMode?.type === "update"
                    ? "Edit request"
                    : selectedEntry?.record.title ??
                      (isResearchView
                        ? isResearchNotFound
                          ? "Research not found"
                          : "Select a Research"
                        : isReviewView
                          ? isReviewNotFound
                            ? "Review not found"
                            : "Select a Review"
                        : isDomainView
                        ? domainNotFoundId === null
                          ? "Select a Domain"
                          : "Domain not found"
                        : isArchitectureView
                          ? isArchitectureNotFound
                            ? "Architecture not found"
                            : selectedArchitectureView === "plan"
                              ? "Architecture Plan"
                              : "Current Architecture"
                        : "Select a record")}
              </h2>
            </div>
            {selectedRequest && requestEditorMode === null ? (
              <button
                className="min-h-11 shrink-0 rounded-control border border-line-strong bg-surface px-3 text-xs font-semibold text-primary hover:bg-primary-soft focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                onClick={() => openRequestEditor(selectedRequest)}
                type="button"
              >
                Edit request
              </button>
            ) : null}
            <button
              aria-label="Close detail pane"
              className="grid size-11 shrink-0 place-items-center rounded-control text-xl text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none"
              onClick={closeDetailPane}
              type="button"
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>

          <div
            className={`min-h-0 min-w-0 flex-1 p-[18px] ${hasVisualPreview ? "overflow-hidden" : "overflow-auto"}`}
          >
            {requestEditorMode ? (
              <RequestDocumentEditor
                key={
                  requestEditorMode.type === "create"
                    ? "new-request"
                    : `request-${requestEditorMode.requestId}`
                }
                onCancel={() => setRequestEditorMode(null)}
                onSaved={saveRequestRecord}
                projectId={context.id}
                request={editorRequest}
              />
            ) : selectedEntry ? (
              <section
                aria-label="Record details"
                className={
                  hasVisualPreview
                    ? "grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)]"
                    : undefined
                }
                data-metadata-collapsed={
                  hasVisualPreview ? isVisualMetadataCollapsed : undefined
                }
              >
                <p
                  aria-hidden={
                    hasVisualPreview ? isVisualMetadataCollapsed : false
                  }
                  className={`mt-0 font-mono text-[10px] font-semibold tracking-[0.1em] text-muted uppercase ${
                    hasVisualPreview
                      ? `overflow-hidden transition-[max-height,margin,opacity] duration-200 motion-reduce:transition-none ${isVisualMetadataCollapsed ? "mb-0 max-h-0 opacity-0" : "mb-[9px] max-h-8 opacity-100"}`
                      : "mb-[9px]"
                  }`}
                >
                  Record metadata
                </p>
                <div
                  aria-hidden={
                    hasVisualPreview ? isVisualMetadataCollapsed : false
                  }
                  className={
                    hasVisualPreview
                      ? `overflow-hidden rounded-card border bg-surface px-4 shadow-card transition-[max-height,padding,opacity] duration-200 motion-reduce:transition-none ${isVisualMetadataCollapsed ? "max-h-0 border-transparent py-0 opacity-0" : "max-h-96 border-line py-4 opacity-100"}`
                      : "rounded-card border border-line bg-surface p-4 shadow-card"
                  }
                  data-record-metadata
                >
                  <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-xs">
                    <dt className="text-subtle">Type</dt>
                    <dd className="m-0 text-ink">
                      {relationConfig[selectedEntry.relation].label}
                    </dd>
                    {selectedWireframe ? (
                      <>
                        <dt className="text-subtle">Index</dt>
                        <dd className="m-0 font-mono text-ink">
                          {selectedWireframe.index}
                        </dd>
                      </>
                    ) : null}
                    {selectedStatus ? (
                      <>
                        <dt className="text-subtle">Status</dt>
                        <dd className="m-0 text-ink">{selectedStatus}</dd>
                      </>
                    ) : null}
                    <dt className="text-subtle">Project</dt>
                    <dd className="m-0 text-ink">{context.title}</dd>
                    <dt className="text-subtle">Updated</dt>
                    <dd className="m-0 font-mono text-ink">
                      {formatDashboardDate(selectedEntry.record.updatedAt)}
                    </dd>
                    <dt className="text-subtle">Source</dt>
                    <dd className="m-0 overflow-wrap-anywhere font-mono text-ink">
                      {getSource(selectedEntry)}
                    </dd>
                  </dl>
                </div>
                {selectedDomain && selectedDomainNode ? (
                  <div className="mt-[18px] rounded-card border border-line bg-surface p-4 shadow-card">
                    <nav aria-label="Domain breadcrumb">
                      <ol className="m-0 flex list-none flex-wrap items-center gap-1 p-0 text-xs text-muted">
                        {selectedDomainBreadcrumb.map((domain, index) => (
                          <li
                            className="inline-flex items-center gap-1"
                            key={domain.id}
                          >
                            {index > 0 ? (
                              <span aria-hidden="true">/</span>
                            ) : null}
                            <span
                              aria-current={
                                domain.id === selectedDomain.id
                                  ? "page"
                                  : undefined
                              }
                              className={
                                domain.id === selectedDomain.id
                                  ? "font-semibold text-ink"
                                  : undefined
                              }
                            >
                              {domain.title}
                            </span>
                          </li>
                        ))}
                      </ol>
                    </nav>
                    <dl className="mt-4 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-xs">
                      <dt className="text-subtle">Parent</dt>
                      <dd className="m-0 text-ink">
                        {selectedDomainParent?.title ?? "Root Domain"}
                      </dd>
                      <dt className="text-subtle">Children</dt>
                      <dd className="m-0 text-ink">
                        {selectedDomainChildren.length > 0
                          ? selectedDomainChildren
                              .map((child) => child.title)
                              .join(", ")
                          : "No immediate children"}
                      </dd>
                    </dl>
                    {selectedDomainNode.hierarchyIssue ? (
                      <p
                        className="mt-4 mb-0 rounded-control border border-danger/30 bg-danger/5 px-3 py-2 text-xs text-danger"
                        role="status"
                      >
                        Hierarchy warning: {selectedDomainNode.hierarchyIssue}.
                        This page is shown once as a fallback root.
                      </p>
                    ) : null}
                  </div>
                ) : null}
                {selectedProductionArchitecture ? (
                  <div
                    className="flex h-full min-h-0 min-w-0 overflow-hidden pt-[18px]"
                    data-preview-expanded="false"
                    data-record-preview
                  >
                    <ArchitectureWorkspace
                      architectures={[selectedProductionArchitecture]}
                    />
                  </div>
                ) : selectedErd ? (
                  <div
                    className="mt-[18px] min-h-0 min-w-0"
                    data-preview-expanded="false"
                    data-record-preview
                  >
                    <ErdDineugPreview
                      key={`${selectedErd.id}-${selectedErd.updatedAt}`}
                      record={selectedErd}
                    />
                  </div>
                ) : selectedHtmlArtifact ? (
                  <div
                    className={`min-h-0 min-w-0 transition-[margin] duration-200 motion-reduce:transition-none ${isVisualMetadataCollapsed ? "h-full" : "mt-[18px]"}`}
                    data-preview-expanded={isVisualMetadataCollapsed}
                    data-record-preview
                  >
                    {selectedArchitecturePlan ? (
                      <ArchitecturePlanPreview
                        key={selectedArchitecturePlan.id}
                        onNavigateWireframe={navigateToWireframe}
                        onScrollStateChange={updateHtmlPreviewScrollState}
                        record={selectedArchitecturePlan}
                      />
                    ) : (
                      <WorkbenchHtmlPreview
                        onNavigateWireframe={navigateToWireframe}
                        onScrollStateChange={updateHtmlPreviewScrollState}
                        onViewportChange={
                          selectedEntry.relation === "wireframes"
                            ? setPreviewViewport
                            : undefined
                        }
                        record={selectedHtmlArtifact.record}
                        viewport={
                          selectedEntry.relation === "wireframes"
                            ? previewViewport
                            : undefined
                        }
                      />
                    )}
                  </div>
                ) : (
                  <div className="mt-[18px] rounded-card border border-line bg-surface p-4 shadow-card">
                    <p className="mt-0 mb-3 border-b border-line pb-3 text-sm font-semibold text-ink">
                      {selectedEntry.record.title}
                    </p>
                    <MarkdownContent content={getContent(selectedEntry)} />
                  </div>
                )}
              </section>
            ) : isResearchView ? (
              <section
                aria-label="Research selection state"
                className="rounded-card border border-line bg-surface px-6 py-10 text-center shadow-card"
              >
                <p className="m-0 text-base font-semibold text-ink">
                  {isResearchNotFound
                    ? "Research not found"
                    : "Select a Research"}
                </p>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {isResearchNotFound
                    ? `Research #${selectedArtifactId} does not exist in this project.`
                    : "Choose a Research record to read its verified findings and sources."}
                </p>
              </section>
            ) : isReviewView ? (
              <section
                aria-label="Review selection state"
                className="rounded-card border border-line bg-surface px-6 py-10 text-center shadow-card"
              >
                <h3 className="m-0 text-base font-semibold text-ink">
                  {isReviewNotFound ? "Review not found" : "Select a Review"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {isReviewNotFound
                    ? `Review #${selectedArtifactId} does not exist in this project.`
                    : "Choose a Review record to read its project assessment and recommendations."}
                </p>
              </section>
            ) : isDomainView ? (
              <section
                aria-label="Domain selection state"
                className="rounded-card border border-line bg-surface px-6 py-10 text-center shadow-card"
              >
                <h3 className="m-0 text-base font-semibold text-ink">
                  {domainNotFoundId === null
                    ? "Select a Domain"
                    : "Domain not found"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {domainNotFoundId === null
                    ? "Choose a page in the hierarchy to read its business rules and responsibilities."
                    : `Domain #${domainNotFoundId} does not exist in this project.`}
                </p>
              </section>
            ) : isArchitectureView ? (
              <section
                aria-label={
                  isArchitectureNotFound
                    ? "Architecture not found"
                    : "Architecture selection state"
                }
                className="rounded-card border border-line bg-surface px-6 py-10 text-center shadow-card"
              >
                <h3 className="m-0 text-base font-semibold text-ink">
                  {isArchitectureNotFound
                    ? "Architecture not found"
                    : selectedArchitectureView === "plan"
                      ? "No Architecture Plan selected"
                      : "No Current Architecture selected"}
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  {isArchitectureNotFound
                    ? `Architecture #${selectedArtifactId} does not exist in the selected ${selectedArchitectureView} view.`
                    : "Choose the available record in this Architecture view."}
                </p>
              </section>
            ) : isRequestView ? (
              <section
                aria-label="Request empty state"
                className="rounded-card border border-line bg-surface px-6 py-10 text-center shadow-card"
              >
                <h3 className="m-0 text-base font-semibold text-ink">
                  No Request selected
                </h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Select an existing record or create a new Request document.
                </p>
              </section>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

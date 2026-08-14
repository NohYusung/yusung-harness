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
import { MarkdownContent } from "@/components/features/dashboard/MarkdownContent";
import { RequestDocumentEditor } from "@/components/features/dashboard/RequestDocumentEditor";
import { formatDashboardDate } from "@/lib/date";
import type {
  ArchitecturePlan,
  ArtifactDocument,
  Design,
  Erd,
  HtmlArtifactDocument,
  Plan,
  ProjectContext,
  ProjectSummary,
  Request,
  Review,
  Task,
  Wireframe,
} from "@/types/dashboard";
import type { WorkspaceRelation } from "./ArtifactBrowser";

type WorkbenchRelation = WorkspaceRelation | "tasks" | "reviews";

type WorkbenchRecord =
  | ArtifactDocument
  | HtmlArtifactDocument
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
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

type MobilePane = "tree" | "records" | "detail";
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

const relationOrder: readonly WorkbenchRelation[] = [
  "plans",
  "tasks",
  "drafts",
  "domains",
  "architectures",
  "wireframes",
  "assets",
  "designs",
  "reviews",
  "requests",
  "workLogs",
  "architecturePlans",
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
  drafts: {
    code: "DR",
    label: "Draft",
    plural: "Drafts",
    dotClassName: "bg-warning",
  },
  domains: {
    code: "DM",
    label: "Domain",
    plural: "Domain",
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
  designs: {
    code: "DS",
    label: "Design",
    plural: "Designs",
    dotClassName: "bg-plum",
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
  architecturePlans: {
    code: "AP",
    label: "Architecture Plan",
    plural: "Architecture Plan",
    dotClassName: "bg-plum",
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

/** 빈 목록에서 다른 artifact를 detail fallback으로 쓰지 않는 독립 workspace를 판별한다. */
function keepsEmptySelection(relation: WorkbenchRelation): boolean {
  return (
    relation === "requests" ||
    relation === "workLogs" ||
    relation === "architecturePlans" ||
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
    drafts: context.drafts,
    domains: context.domains,
    architectures: context.architectures,
    wireframes: context.wireframes,
    assets: context.assets,
    designs: context.designs,
    reviews: context.reviews,
    requests: [...requests],
    workLogs: context.workLogs,
    architecturePlans: context.architecturePlans,
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

  if (entry.relation === "designs") {
    const design = entry.record as Design;
    return [
      { record: design.wireframe, relation: "wireframes" },
      { record: design.asset, relation: "assets" },
    ];
  }

  const designRelations = context.designs.flatMap((design) => {
    if (
      entry.relation === "wireframes" &&
      design.wireframeId === entry.record.id
    ) {
      return [{ record: design, relation: "designs" as const }];
    }
    if (entry.relation === "assets" && design.assetId === entry.record.id) {
      return [{ record: design, relation: "designs" as const }];
    }
    return [];
  });

  return designRelations;
}

function getHtmlSelection(entry: WorkbenchEntry): HtmlArtifactSelection | null {
  /** Architecture Plan은 별도 html 구조도를 가진 hybrid preview로 분류한다. */
  if (entry.relation === "architecturePlans") {
    const architecturePlan = entry.record as ArchitecturePlan;
    return { kind: "Architecture Plan", record: architecturePlan };
  }

  /** ERD는 저장된 완성형 HTML을 공용 sandbox preview에 직접 전달한다. */
  if (entry.relation === "erds") {
    return { kind: "ERD", record: entry.record as Erd };
  }

  const kindByRelation: Partial<Record<WorkbenchRelation, HtmlArtifactKind>> = {
    assets: "Asset",
    designs: "Design",
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
  record: ArchitecturePlan;
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
                저장된 구조도가 없습니다
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

  const relation = entry.relation === "reviews" ? "plans" : entry.relation;
  return `/projects/${projectId}?type=${relation}&id=${entry.record.id}`;
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
  const initialEntry = useMemo(() => {
    if (selectedTaskId) {
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
  }, [activeRelation, allEntries, selectedArtifactId, selectedTaskId]);
  const [typeFilter, setTypeFilter] =
    useState<WorkbenchRelation>(activeRelation);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [versionFilter, setVersionFilter] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialEntry ? getEntryKey(initialEntry) : null,
  );
  const [expandedPlanIds, setExpandedPlanIds] = useState<ReadonlySet<number>>(
    () =>
      getInitialExpandedPlanIds(
        activeRelation,
        context,
        selectedArtifactId,
        selectedTaskId,
      ),
  );
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

  useSearchShortcut(searchRef);

  const selectedEntry =
    allEntries.find((entry) => getEntryKey(entry) === selectedKey) ??
    (selectedKey === null ? null : (allEntries[0] ?? null));
  const selectedStatus = selectedEntry
    ? getStatus(selectedEntry)
    : null;
  const selectedHtmlArtifact = selectedEntry
    ? getHtmlSelection(selectedEntry)
    : null;
  /** Architecture Plan에서만 content/html 탭 preview에 원본 레코드를 제공한다. */
  const selectedArchitecturePlan =
    selectedEntry?.relation === "architecturePlans"
      ? (selectedEntry.record as ArchitecturePlan)
      : null;
  /** Wireframe 전용 metadata만 노출하도록 relation을 확인한 뒤 record를 좁힌다. */
  const selectedWireframe =
    selectedEntry?.relation === "wireframes"
      ? (selectedEntry.record as Wireframe)
      : null;
  /** Design 전용 관계 ID metadata만 노출하도록 relation을 확인한 뒤 record를 좁힌다. */
  const selectedDesign =
    selectedEntry?.relation === "designs"
      ? (selectedEntry.record as Design)
      : null;
  /** Request 선택에서만 편집 진입점을 노출한다. */
  const selectedRequest =
    selectedEntry?.relation === "requests"
      ? (selectedEntry.record as Request)
      : null;
  const isWireframeView = typeFilter === "wireframes";
  const isVersionFilteredView =
    typeFilter === "wireframes" || typeFilter === "designs";
  /** 현재 relation에 실제 존재하는 고유 version만 최신순으로 제공한다. */
  const availableVersions = useMemo(() => {
    const versions =
      typeFilter === "wireframes"
        ? context.wireframes.map((wireframe) => wireframe.version)
        : typeFilter === "designs"
          ? context.designs.map((design) => design.version)
          : [];

    return [...new Set(versions)].sort((left, right) => right - left);
  }, [context.designs, context.wireframes, typeFilter]);
  /** Version relation은 유효한 현재 선택을 보존하고 없거나 stale하면 실제 최신 version을 기본값으로 사용한다. */
  const effectiveVersionFilter =
    isVersionFilteredView
      ? versionFilter !== null && availableVersions.includes(versionFilter)
        ? versionFilter
        : (availableVersions[0] ?? null)
      : versionFilter;
  const isRequestView = typeFilter === "requests";
  /** 수정 중인 record는 성공 응답으로 교체된 로컬 Request 목록에서 읽는다. */
  const editorRequest =
    requestEditorMode?.type === "update"
      ? (requestRecords.find(
          (request) => request.id === requestEditorMode.requestId,
        ) ?? null)
      : null;
  const normalizedQuery = query.trim().toLocaleLowerCase();

  /** 현재 status/version/query 조합에 단일 record가 일치하는지 판별한다. */
  function matchesVisibleFilters(entry: WorkbenchEntry): boolean {
    const config = relationConfig[entry.relation];
    /** Version relation에는 숨겨진 status filter 대신 선택한 version만 적용한다. */
    const matchesRecordFilter =
      entry.relation === "wireframes" || entry.relation === "designs"
        ? effectiveVersionFilter === null ||
          (entry.record as Wireframe | Design).version ===
            effectiveVersionFilter
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
  const visibleEntries = allEntries
    .filter((entry) => entry.relation === typeFilter)
    .flatMap((entry) => {
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
  const currentProject =
    projects.find((project) => project.id === context.id) ?? projects[0];
  const currentRepository = context.repoPaths[0];
  const repositoryPath = currentRepository?.path ?? "No repository connected";

  /** Plan은 계층을 토글하고, 모든 record는 선택 deep link와 detail pane을 갱신한다. */
  function selectEntry(entry: WorkbenchEntry) {
    setRequestEditorMode(null);
    setIsHtmlMetadataCollapsed(false);
    setSelectedKey(getEntryKey(entry));
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

    router.replace(getRelationHref(entry, context.id), { scroll: false });
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

    /** Design preview에서는 같은 Asset을 사용한 대상 Wireframe의 형제 Design을 선택한다. */
    if (selectedDesign) {
      const siblingDesign = context.designs.find(
        (candidate) =>
          candidate.assetId === selectedDesign.assetId &&
          candidate.wireframeId === wireframe.id,
      );

      /** 형제 Design이 없으면 현재 Design 선택과 deep link를 그대로 유지한다. */
      if (!siblingDesign) {
        return;
      }

      selectEntry({ record: siblingDesign, relation: "designs" });
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
      <header className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-sidebar-line bg-sidebar px-2 text-sidebar-ink shadow-card sm:gap-4 sm:px-4">
        <strong className="block min-w-0 shrink truncate text-xs leading-tight font-semibold tracking-[-0.01em] sm:text-base md:min-w-[250px]">
          Yusung Harness
        </strong>

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
            placeholder="Search titles, types, or IDs"
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
            <div className="m-3 rounded-card border border-sidebar-line bg-sidebar-hover p-3 shadow-card">
              <label className="sr-only" htmlFor="workbench-project">
                Project
              </label>
              <select
                id="workbench-project"
                className="h-[38px] w-full border-0 bg-transparent text-[13px] font-semibold text-sidebar-ink focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none"
                onChange={(event) =>
                  router.push(`/projects/${event.currentTarget.value}`)
                }
                value={currentProject?.id ?? context.id}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.title} ·{" "}
                    {project.repoPaths[0]?.repoType ?? "LOCAL"}
                  </option>
                ))}
              </select>
              <p className="mt-[7px] mb-0 truncate font-mono text-[10px] text-sidebar-subtle">
                {repositoryPath}
              </p>
            </div>

            <nav aria-label="Artifact types" className="px-2 pt-2 pb-3">
              <p className="m-0 px-2.5 py-2 font-mono text-[10px] tracking-[0.1em] text-sidebar-subtle uppercase">
                Project records
              </p>
              {relationOrder
                .filter((relation) => relation !== "tasks")
                .map((relation) => {
                  const config = relationConfig[relation];
                  const relationEntries = allEntries.filter(
                    (entry) => entry.relation === relation,
                  );
                  return (
                    <div key={relation}>
                      <button
                        aria-pressed={
                          typeFilter === relation
                        }
                        className="flex min-h-11 w-full items-center gap-[9px] rounded-control border-0 bg-transparent px-[9px] py-[7px] text-left text-[13px] text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-ink aria-pressed:bg-sidebar-selected aria-pressed:text-sidebar-ink aria-pressed:shadow-[inset_3px_0_var(--color-accent)] focus-visible:ring-2 focus-visible:ring-focus-dark focus-visible:outline-none"
                        onClick={() => {
                          setTypeFilter(relation);
                          /** Relation 전환마다 explicit version을 비워 각 workspace의 최신 version을 다시 선택한다. */
                          setVersionFilter(null);
                          setMobilePane("records");

                          /** 독립 workspace 진입 시 이전 도메인의 선택·편집 상태를 노출하지 않는다. */
                          if (keepsEmptySelection(relation)) {
                            setSelectedKey(
                              relationEntries[0]
                                ? getEntryKey(relationEntries[0])
                                : null,
                            );
                            setStatusFilter("All");
                            setRequestEditorMode(null);
                          }

                          router.replace(
                            `/projects/${context.id}?type=${relation}`,
                            { scroll: false },
                          );
                        }}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="w-[18px] text-center font-mono text-[11px] text-sidebar-subtle"
                        >
                          {config.code}
                        </span>
                        <span className="flex-1">{config.plural}</span>
                        <span className="font-mono text-[10px] text-sidebar-subtle">
                          {relationEntries.length}
                        </span>
                      </button>
                    </div>
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
          <div className="flex items-center gap-2 border-b border-line bg-surface-muted px-4 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
              {context.title} /{" "}
              <strong>{relationConfig[typeFilter].plural}</strong>
            </span>
            {isVersionFilteredView ? (
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
          <div className="m-3 min-h-0 flex-1 overflow-auto rounded-card border border-line bg-surface shadow-card">
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
            <div aria-label="Artifact records" role="listbox">
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
                /** 시각적 header가 숨겨져도 각 option에서 전체 칼럼 의미를 전달한다. */
                const accessibleName = wireframe
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
                    className={`grid min-h-14 w-full items-center gap-3 border-0 border-b border-line bg-surface px-4 text-left text-ink transition-colors hover:bg-hover aria-selected:bg-selected aria-selected:shadow-[inset_3px_0_var(--color-accent)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none ${wireframe ? "min-w-[650px] grid-cols-[88px_52px_72px_minmax(180px,1fr)_180px]" : "min-w-[740px] grid-cols-[88px_52px_minmax(180px,1fr)_96px_52px_180px]"}`}
                    onClick={() => selectEntry(entry)}
                    data-plan-expanded={
                      isPlanExpanded === null
                        ? undefined
                        : String(isPlanExpanded)
                    }
                    role="option"
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
                          : "min-w-0"
                      }
                      data-plan-task-depth={parentPlan ? "1" : undefined}
                      data-wireframe-depth={wireframeHierarchy?.depth}
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
                      <strong className="block truncate text-[13px]">
                        {entry.record.title}
                      </strong>
                      {secondaryMeta ? (
                        <small className="mt-1 block truncate font-mono text-[10px] text-subtle">
                          {secondaryMeta}
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
                {isRequestView && requestRecords.length === 0
                  ? "No Request records"
                  : "No matching records"}
              </strong>
              {isRequestView && requestRecords.length === 0
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
                    : (selectedEntry?.record.title ?? "Select a record")}
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
            className={`min-h-0 min-w-0 flex-1 p-[18px] ${selectedHtmlArtifact ? "overflow-hidden" : "overflow-auto"}`}
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
                  selectedHtmlArtifact
                    ? "grid h-full min-h-0 min-w-0 grid-rows-[auto_auto_minmax(0,1fr)]"
                    : undefined
                }
                data-metadata-collapsed={
                  selectedHtmlArtifact ? isHtmlMetadataCollapsed : undefined
                }
              >
                <p
                  aria-hidden={
                    selectedHtmlArtifact ? isHtmlMetadataCollapsed : false
                  }
                  className={`mt-0 font-mono text-[10px] font-semibold tracking-[0.1em] text-muted uppercase ${
                    selectedHtmlArtifact
                      ? `overflow-hidden transition-[max-height,margin,opacity] duration-200 motion-reduce:transition-none ${isHtmlMetadataCollapsed ? "mb-0 max-h-0 opacity-0" : "mb-[9px] max-h-8 opacity-100"}`
                      : "mb-[9px]"
                  }`}
                >
                  Record metadata
                </p>
                <div
                  aria-hidden={
                    selectedHtmlArtifact ? isHtmlMetadataCollapsed : false
                  }
                  className={
                    selectedHtmlArtifact
                      ? `overflow-hidden rounded-card border bg-surface px-4 shadow-card transition-[max-height,padding,opacity] duration-200 motion-reduce:transition-none ${isHtmlMetadataCollapsed ? "max-h-0 border-transparent py-0 opacity-0" : "max-h-96 border-line py-4 opacity-100"}`
                      : "rounded-card border border-line bg-surface p-4 shadow-card"
                  }
                  data-record-metadata
                >
                  <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-xs">
                    <dt className="text-subtle">Type</dt>
                    <dd className="m-0 text-ink">
                      {relationConfig[selectedEntry.relation].label}
                    </dd>
                    {selectedDesign ? (
                      <>
                        <dt className="text-subtle">Asset ID</dt>
                        <dd className="m-0 font-mono text-ink">
                          {selectedDesign.assetId}
                        </dd>
                        <dt className="text-subtle">Wireframe ID</dt>
                        <dd className="m-0 font-mono text-ink">
                          {selectedDesign.wireframeId}
                        </dd>
                      </>
                    ) : null}
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
                {selectedHtmlArtifact ? (
                  <div
                    className={`min-h-0 min-w-0 transition-[margin] duration-200 motion-reduce:transition-none ${isHtmlMetadataCollapsed ? "h-full" : "mt-[18px]"}`}
                    data-preview-expanded={isHtmlMetadataCollapsed}
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
                          selectedEntry.relation === "wireframes" ||
                          selectedEntry.relation === "designs"
                            ? setPreviewViewport
                            : undefined
                        }
                        record={selectedHtmlArtifact.record}
                        viewport={
                          selectedEntry.relation === "wireframes" ||
                          selectedEntry.relation === "designs"
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

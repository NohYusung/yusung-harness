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
} from "@/components/features/dashboard/ArtifactHtmlSidePage";
import { MarkdownContent } from "@/components/features/dashboard/MarkdownContent";
import { formatDashboardDate } from "@/lib/date";
import type {
  ArtifactDocument,
  Design,
  HtmlArtifactDocument,
  Plan,
  ProjectContext,
  ProjectSummary,
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
type RecordStatus = "Completed" | "Current" | "Pending" | "Previous";
type StatusFilter = "All" | "Completed" | "Pending";

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
    dotClassName: "bg-primary",
  },
  architectures: {
    code: "AR",
    label: "Architecture",
    plural: "Architecture",
    dotClassName: "bg-violet",
  },
  wireframes: {
    code: "WF",
    label: "Wireframe",
    plural: "Wireframes",
    dotClassName: "bg-teal",
  },
  assets: {
    code: "AS",
    label: "Asset",
    plural: "Assets",
    dotClassName: "bg-warning",
  },
  designs: {
    code: "DS",
    label: "Design",
    plural: "Designs",
    dotClassName: "bg-violet",
  },
  reviews: {
    code: "RV",
    label: "Review",
    plural: "Reviews",
    dotClassName: "bg-danger",
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

function getEntries(context: ProjectContext): WorkbenchEntry[] {
  const entriesByRelation: Record<WorkbenchRelation, WorkbenchRecord[]> = {
    plans: context.plans,
    tasks: context.tasks,
    drafts: context.drafts,
    domains: context.domains,
    architectures: context.architectures,
    wireframes: context.wireframes,
    assets: context.assets,
    designs: context.designs,
    reviews: context.reviews,
  };

  return relationOrder.flatMap((relation) =>
    entriesByRelation[relation].map((record) => ({ record, relation })),
  );
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

/** 실제 Task lifecycle 또는 Plan version에서 파생 가능한 상태만 반환한다. */
function getStatus(
  entry: WorkbenchEntry,
  context: ProjectContext,
): RecordStatus | null {
  if (entry.relation === "plans") {
    const latestVersion = Math.max(
      ...context.plans.map((plan) => plan.version),
      Number.NEGATIVE_INFINITY,
    );

    return (entry.record as Plan).version === latestVersion
      ? "Current"
      : "Previous";
  }

  if (entry.relation === "tasks") {
    return (entry.record as Task).status === "COMPLETED"
      ? "Completed"
      : "Pending";
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
    return `v${plan.version} · ${completed}/${plan.tasks.length} Tasks complete`;
  }

  if (entry.relation === "tasks") {
    const task = entry.record as Task;
    const plan = context.plans.find(
      (candidate) => candidate.id === task.planId,
    );
    return plan ? `Plan v${plan.version}` : null;
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
    return context.tasks
      .filter((task) => task.planId === plan.id)
      .map((record) => ({ record, relation: "tasks" }));
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
  record,
}: {
  onNavigateWireframe: (target: HtmlPreviewWireframeNavigation) => void;
  onScrollStateChange: (scrollTop: number) => void;
  record: HtmlArtifactDocument;
}) {
  return (
    <div className="h-full min-h-0 overflow-hidden rounded-card">
      <ArtifactHtmlPreviewFrame
        onNavigateWireframe={onNavigateWireframe}
        onScrollStateChange={onScrollStateChange}
        record={record}
      />
    </div>
  );
}

/** lifecycle 상태 badge의 의미에 맞는 색상만 선택한다. */
function getStatusClassName(status: RecordStatus): string {
  if (status === "Completed") {
    return "inline-flex w-max rounded-full border border-[#3e5a39] bg-success-soft px-[7px] py-[3px] font-mono text-[10px] text-success";
  }
  if (status === "Pending") {
    return "inline-flex w-max rounded-full border border-[#594727] bg-warning-soft px-[7px] py-[3px] font-mono text-[10px] text-warning";
  }
  return "inline-flex w-max rounded-full border border-line px-[7px] py-[3px] font-mono text-[10px] text-muted";
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
  const allEntries = useMemo(() => getEntries(context), [context]);
  /** visible row마다 재구성하지 않도록 Wireframe lookup을 context 변경 시 한 번만 만든다. */
  const wireframesById = useMemo(
    () =>
      new Map(
        context.wireframes.map((wireframe) => [wireframe.id, wireframe]),
      ),
    [context.wireframes],
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

    return (
      allEntries.find((entry) => entry.relation === activeRelation) ??
      allEntries[0]
    );
  }, [activeRelation, allEntries, selectedArtifactId, selectedTaskId]);
  const [typeFilter, setTypeFilter] =
    useState<WorkbenchRelation>(activeRelation);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");
  const [query, setQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(
    initialEntry ? getEntryKey(initialEntry) : null,
  );
  const [mobilePane, setMobilePane] = useState<MobilePane>("records");
  const [isDetailPaneOpen, setIsDetailPaneOpen] = useState(true);
  const [detailPaneRatio, setDetailPaneRatio] = useState(
    defaultDetailPaneRatio,
  );
  const [isHtmlMetadataCollapsed, setIsHtmlMetadataCollapsed] = useState(false);

  useSearchShortcut(searchRef);

  const selectedEntry =
    allEntries.find((entry) => getEntryKey(entry) === selectedKey) ??
    allEntries[0] ??
    null;
  const selectedStatus = selectedEntry
    ? getStatus(selectedEntry, context)
    : null;
  const selectedHtmlArtifact = selectedEntry
    ? getHtmlSelection(selectedEntry)
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
  const selectedPlan =
    activeRelation === "plans" && selectedArtifactId
      ? (context.plans.find((plan) => plan.id === selectedArtifactId) ?? null)
      : null;
  const visibleEntries = allEntries.filter((entry) => {
    const config = relationConfig[entry.relation];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const matchesType = selectedPlan
      ? entry.relation === "tasks" &&
        (entry.record as Task).planId === selectedPlan.id
      : entry.relation === typeFilter;
    const matchesStatus =
      statusFilter === "All" || getStatus(entry, context) === statusFilter;
    const matchesQuery =
      normalizedQuery.length === 0 ||
      [entry.record.title, entry.record.id, config.label]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalizedQuery);

    return matchesType && matchesStatus && matchesQuery;
  });
  const currentProject =
    projects.find((project) => project.id === context.id) ?? projects[0];
  const currentRepository = context.repoPaths[0];
  const repositoryPath = currentRepository?.path ?? "No repository connected";

  /** 선택 record와 deep link를 유지하면서 닫힌 detail pane을 다시 연다. */
  function selectEntry(entry: WorkbenchEntry) {
    setIsHtmlMetadataCollapsed(false);
    setSelectedKey(getEntryKey(entry));
    setIsDetailPaneOpen(true);
    setMobilePane("detail");
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
    setIsDetailPaneOpen(false);
    setMobilePane("records");
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

  /** Tailwind grid가 viewport 비율을 참조하도록 component-local CSS 변수를 주입한다. */
  const workspaceStyle = {
    "--detail-pane-width": `${detailPaneRatio}%`,
  } as CSSProperties;
  /** Detail 표시 여부에 따라 Explorer / Records / Detail grid를 2열 또는 3열로 전환한다. */
  const workspaceGridClassName = isDetailPaneOpen
    ? "md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)] lg:grid-cols-[270px_minmax(0,1fr)_var(--detail-pane-width)]"
    : "md:grid-cols-[230px_minmax(0,1fr)] lg:grid-cols-[270px_minmax(0,1fr)]";

  return (
    <div
      className="grid h-dvh min-h-dvh grid-rows-[58px_minmax(0,1fr)] overflow-hidden bg-canvas max-md:h-auto max-md:overflow-visible"
      data-mobile-pane={mobilePane}
    >
      <header className="flex items-center gap-4 border-b border-line bg-sidebar px-4">
        <strong className="block min-w-0 truncate text-sm leading-tight tracking-[-0.01em] md:min-w-[250px]">
          Yusung Harness
        </strong>

        <label className="relative min-w-0 max-w-[680px] flex-1">
          <span className="sr-only">Search records</span>
          <span
            aria-hidden="true"
            className="absolute top-[9px] left-3 text-subtle"
          >
            ⌕
          </span>
          <input
            ref={searchRef}
            aria-label="Search records"
            className="h-9 w-full rounded-[7px] border border-line bg-surface pr-[90px] pl-9 text-[13px] placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none max-md:pr-3"
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
          <span className="absolute top-[7px] right-2 rounded-[5px] border border-line px-1.5 py-[3px] font-mono text-[10px] text-subtle max-md:hidden">
            ⌘ K
          </span>
        </label>

        <div className="ml-auto hidden min-w-0 items-center gap-2 font-mono text-[11px] text-muted md:flex">
          <span
            aria-hidden="true"
            className="size-[7px] shrink-0 rounded-full bg-success shadow-[0_0_0_3px_rgb(182_232_117_/_0.08)]"
          />
          <span className="max-w-[18rem] truncate">{repositoryPath}</span>
        </div>

        <nav aria-label="Mobile panes" className="ml-auto flex gap-1 md:hidden">
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
              className="h-9 min-w-9 rounded-control border border-line bg-surface px-2 text-[11px] text-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              onClick={() => selectMobilePane(pane.id)}
              type="button"
            >
              {pane.label}
            </button>
          ))}
        </nav>
      </header>

      <main
        className={`min-h-0 bg-surface md:grid lg:grid ${workspaceGridClassName}`}
        style={workspaceStyle}
      >
        <aside
          aria-label="Project artifact tree"
          className={`${mobilePane === "tree" ? "flex" : "hidden"} min-h-[calc(100dvh-58px)] min-w-0 flex-col border-r border-line bg-surface md:flex md:min-h-0`}
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line px-3.5 py-2.5">
            <h2 className="m-0 text-xs font-semibold tracking-[0.08em] text-muted uppercase">
              Explorer
            </h2>
            <span className="font-mono text-[11px] text-subtle">
              {allEntries.length} records
            </span>
          </div>
          <div className="min-h-0 overflow-auto">
            <div className="m-3 rounded-card border border-line bg-surface-muted p-3">
              <label className="sr-only" htmlFor="workbench-project">
                Project
              </label>
              <select
                id="workbench-project"
                className="h-[38px] w-full border-0 bg-transparent text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
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
              <p className="mt-[7px] mb-0 truncate font-mono text-[10px] text-subtle">
                {repositoryPath}
              </p>
            </div>

            <nav aria-label="Artifact types" className="px-2 pt-2 pb-3">
              <p className="m-0 px-2.5 py-2 font-mono text-[10px] tracking-[0.1em] text-subtle uppercase">
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
                          typeFilter === relation && selectedPlan === null
                        }
                        className="flex min-h-9 w-full items-center gap-[9px] rounded-control border-0 bg-transparent px-[9px] py-[7px] text-left text-[13px] text-muted hover:bg-surface-muted hover:text-ink aria-pressed:bg-primary-soft aria-pressed:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                        onClick={() => {
                          setTypeFilter(relation);
                          setMobilePane("records");
                          router.replace(
                            `/projects/${context.id}?type=${relation}`,
                            { scroll: false },
                          );
                        }}
                        type="button"
                      >
                        <span
                          aria-hidden="true"
                          className="w-[18px] text-center font-mono text-[11px] text-subtle"
                        >
                          {config.code}
                        </span>
                        <span className="flex-1">{config.plural}</span>
                        <span className="font-mono text-[10px] text-subtle">
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
          className={`${mobilePane === "records" ? "flex" : "hidden"} min-h-[calc(100dvh-58px)] min-w-0 flex-col border-r border-line bg-surface-muted md:flex md:min-h-0`}
        >
          <div className="flex min-h-14 items-center justify-between gap-3 border-b border-line bg-surface px-3.5 py-2.5">
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
                className="m-0 inline text-xs font-semibold tracking-[0.08em] text-muted uppercase"
              >
                Records
              </h2>
            </div>
            <span
              aria-live="polite"
              className="font-mono text-[11px] text-subtle"
            >
              {visibleEntries.length} visible
            </span>
          </div>
          <div className="flex items-center gap-2 border-b border-line px-3.5 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">
              {context.title} /{" "}
              <strong>
                {selectedPlan
                  ? `${selectedPlan.title} · Tasks`
                  : relationConfig[typeFilter].plural}
              </strong>
            </span>
            <label>
              <span className="sr-only">Status</span>
              <select
                aria-label="Status"
                className="h-[34px] rounded-control border border-line bg-surface pr-7 pl-2.5 text-xs focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                onChange={(event) =>
                  setStatusFilter(event.target.value as StatusFilter)
                }
                value={statusFilter}
              >
                <option value="All">All status</option>
                <option value="Completed">Completed</option>
                <option value="Pending">Pending</option>
              </select>
            </label>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            <div
              aria-hidden="true"
              className="sticky top-0 z-10 grid h-[34px] min-w-[740px] grid-cols-[88px_52px_minmax(180px,1fr)_96px_52px_180px] items-center gap-3 border-b border-line bg-surface-muted px-4 font-mono text-[10px] tracking-[0.06em] text-subtle uppercase"
            >
              <span>Type</span>
              <span>No</span>
              <span>Title</span>
              <span>Status</span>
              <span>Links</span>
              <span>Updated</span>
            </div>
            <div aria-label="Artifact records" role="listbox">
              {visibleEntries.map((entry) => {
                const config = relationConfig[entry.relation];
                const status = getStatus(entry, context);
                const entryRelations = getRelations(entry, context);
                const secondaryMeta = getEntrySecondaryMeta(entry, context);
                const isSelected = getEntryKey(entry) === selectedKey;
                const updatedAt = formatDashboardDate(entry.record.updatedAt);
                /** 시각적 header가 숨겨져도 각 option에서 전체 칼럼 의미를 전달한다. */
                const accessibleName = [
                  `Type ${config.label}`,
                  `No ${entry.record.id}`,
                  `Title ${entry.record.title}`,
                  `Status ${status ?? "None"}`,
                  `Links ${entryRelations.length}`,
                  `Updated ${updatedAt}`,
                ].join(", ");
                const wireframeHierarchy = getWireframeHierarchy(
                  entry,
                  wireframesById,
                );

                return (
                  <button
                    key={getEntryKey(entry)}
                    aria-describedby={
                      wireframeHierarchy?.parent
                        ? `wireframe-parent-${entry.record.id}`
                        : undefined
                    }
                    aria-label={accessibleName}
                    aria-selected={isSelected}
                    className="grid min-h-14 w-full min-w-[740px] grid-cols-[88px_52px_minmax(180px,1fr)_96px_52px_180px] items-center gap-3 border-0 border-b border-line bg-transparent px-4 text-left text-ink hover:bg-hover aria-selected:bg-selected aria-selected:shadow-[inset_2px_0_var(--color-primary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus focus-visible:outline-none"
                    onClick={() => selectEntry(entry)}
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
                    <span
                      className={
                        wireframeHierarchy?.depth === 1
                          ? "relative min-w-0 pl-4"
                          : "min-w-0"
                      }
                      data-wireframe-depth={wireframeHierarchy?.depth}
                    >
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
                No matching records
              </strong>
              Try another search or type filter.
            </div>
          ) : null}
        </section>

        <aside
          aria-labelledby="detail-heading"
          className={`${isDetailPaneOpen && mobilePane === "detail" ? "flex" : "hidden"} relative min-h-[calc(100dvh-58px)] min-w-0 flex-col bg-[#0f141b] ${isDetailPaneOpen ? "md:flex" : "md:hidden"} md:min-h-0`}
        >
          <div
            aria-label="Resize detail pane"
            aria-orientation="vertical"
            aria-valuemax={maximumDetailPaneRatio}
            aria-valuemin={minimumDetailPaneRatio}
            aria-valuenow={detailPaneRatio}
            aria-valuetext={`${detailPaneRatio} percent of viewport`}
            className="group absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 touch-none cursor-col-resize items-center justify-center focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none md:flex"
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
              className="h-14 w-0.5 rounded-full bg-line transition-colors group-hover:bg-primary group-focus-visible:bg-primary motion-reduce:transition-none"
            />
          </div>

          <div className="flex min-h-14 items-center gap-3 border-b border-line bg-surface px-3.5 py-2.5">
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
                className="m-0 truncate text-[13px] font-semibold text-ink"
              >
                {selectedEntry?.record.title ?? "Select a record"}
              </h2>
              <p className="mt-1 mb-0 font-mono text-[10px] text-subtle">
                {selectedEntry
                  ? `${relationConfig[selectedEntry.relation].label.toUpperCase()} · #${selectedEntry.record.id}`
                  : "Choose a record to inspect"}
              </p>
            </div>
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
            className={`min-h-0 flex-1 p-[18px] ${selectedHtmlArtifact ? "overflow-hidden" : "overflow-auto"}`}
          >
            {selectedEntry ? (
              <section
                aria-label="Record details"
                className={
                  selectedHtmlArtifact
                    ? "grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)]"
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
                  className={`mt-0 font-mono text-[10px] tracking-[0.1em] text-subtle uppercase ${
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
                      ? `overflow-hidden transition-[max-height,opacity] duration-200 motion-reduce:transition-none ${isHtmlMetadataCollapsed ? "max-h-0 opacity-0" : "max-h-96 opacity-100"}`
                      : undefined
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
                    className={`min-h-0 transition-[margin] duration-200 motion-reduce:transition-none ${isHtmlMetadataCollapsed ? "h-full" : "mt-[18px]"}`}
                    data-preview-expanded={isHtmlMetadataCollapsed}
                    data-record-preview
                  >
                    <WorkbenchHtmlPreview
                      onNavigateWireframe={navigateToWireframe}
                      onScrollStateChange={updateHtmlPreviewScrollState}
                      record={selectedHtmlArtifact.record}
                    />
                  </div>
                ) : (
                  <div className="mt-[18px] border-t border-line pt-4">
                    <p className="mt-0 mb-[9px] text-sm font-semibold text-ink">
                      {selectedEntry.record.title}
                    </p>
                    <MarkdownContent content={getContent(selectedEntry)} />
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </aside>
      </main>
    </div>
  );
}

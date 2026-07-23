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
  ArtifactHtmlSidePage,
  type HtmlArtifactKind,
  type HtmlArtifactSelection,
} from "@/components/features/dashboard/ArtifactHtmlSidePage";
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

interface ArtifactWorkbenchProps {
  activeRelation: WorkspaceRelation;
  context: ProjectContext;
  projects: ProjectSummary[];
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

type DetailTab = "metadata" | "relations" | "preview";
type MobilePane = "tree" | "records" | "detail";
type RecordStatus =
  | "Completed"
  | "Current"
  | "Document"
  | "Draft"
  | "HTML"
  | "Pending"
  | "Previous"
  | "Snapshot";
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

const detailTabs: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: "metadata", label: "Metadata" },
  { id: "relations", label: "Relations" },
  { id: "preview", label: "Preview" },
];

/** Desktop detail pane이 viewport에서 차지하는 초기 비율과 조절 범위. */
const defaultDetailPaneRatio = 30;
const minimumDetailPaneRatio = 15;
const maximumDetailPaneRatio = 70;
const detailPaneResizeStep = 2;

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

function getStatus(
  entry: WorkbenchEntry,
  context: ProjectContext,
): RecordStatus {
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

  if (
    entry.relation === "wireframes" ||
    entry.relation === "assets" ||
    entry.relation === "designs"
  ) {
    return "HTML";
  }

  if (entry.relation === "drafts") return "Draft";
  if (entry.relation === "domains" || entry.relation === "architectures") {
    return "Snapshot";
  }
  if (entry.relation === "reviews") return "Completed";

  return "Document";
}

function getEntryMeta(entry: WorkbenchEntry, context: ProjectContext): string {
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
    return `#${task.id}${plan ? ` · Plan v${plan.version}` : ""}`;
  }

  return `#${entry.record.id} · ${formatDashboardDate(entry.record.updatedAt)}`;
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

  if (
    entry.relation === "wireframes" ||
    entry.relation === "assets" ||
    entry.relation === "designs"
  ) {
    return "Open the isolated HTML preview to inspect this generated interface artifact.";
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

function getStatusClassName(status: RecordStatus): string {
  if (status === "Completed") {
    return "border-[#3e5a39] bg-success-soft text-success";
  }
  if (status === "Pending") {
    return "border-[#594727] bg-warning-soft text-warning";
  }
  return "border-line text-muted";
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

function PreviewMock() {
  return (
    <div className="min-h-[310px] overflow-hidden rounded-card border border-line bg-[#f4f6f8] text-[#171a1f]">
      <div className="flex h-[34px] items-center gap-[5px] border-b border-[#c9d0d8] bg-[#e7ebef] px-[10px]">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            aria-hidden="true"
            className="size-[7px] rounded-full bg-[#aeb8c4]"
          />
        ))}
      </div>
      <div className="p-[22px]">
        <div className="mb-[18px] h-[18px] rounded bg-[#dbe2ea]" />
        <div className="h-[88px] rounded-control bg-gradient-to-br from-[#d9e8ff] to-[#e8defe] p-[18px] text-sm font-bold">
          Artifact Workbench
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[0, 1, 2].map((card) => (
            <span
              key={card}
              aria-hidden="true"
              className="h-[54px] rounded-[5px] border border-[#d1d8df] bg-white"
            />
          ))}
        </div>
      </div>
    </div>
  );
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
  const [detailTab, setDetailTab] = useState<DetailTab>("metadata");
  const [mobilePane, setMobilePane] = useState<MobilePane>("records");
  const [detailPaneRatio, setDetailPaneRatio] = useState(
    defaultDetailPaneRatio,
  );
  const [previewSelection, setPreviewSelection] =
    useState<HtmlArtifactSelection | null>(null);
  const [copied, setCopied] = useState(false);

  useSearchShortcut(searchRef);

  const selectedEntry =
    allEntries.find((entry) => getEntryKey(entry) === selectedKey) ??
    allEntries[0] ??
    null;
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
  const relations = selectedEntry ? getRelations(selectedEntry, context) : [];
  const currentProject =
    projects.find((project) => project.id === context.id) ?? projects[0];
  const currentRepository = context.repoPaths[0];
  const repositoryPath = currentRepository?.path ?? "No repository connected";
  const repositoryType = currentRepository?.repoType ?? "LOCAL";

  function selectEntry(entry: WorkbenchEntry) {
    setSelectedKey(getEntryKey(entry));
    setMobilePane("detail");
    setDetailTab("metadata");
    router.replace(getRelationHref(entry, context.id), { scroll: false });
  }

  async function copyDeepLink() {
    if (!selectedEntry) return;

    const path = getRelationHref(selectedEntry, context.id);
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 900);
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

  return (
    <div
      className="grid h-dvh min-h-dvh grid-rows-[58px_minmax(0,1fr)] overflow-hidden bg-canvas max-md:h-auto max-md:overflow-visible"
      data-mobile-pane={mobilePane}
    >
      <header className="flex items-center gap-4 border-b border-line bg-sidebar px-4">
        <div className="flex min-w-0 items-center gap-[10px] md:min-w-[250px]">
          <span
            aria-hidden="true"
            className="grid size-[30px] shrink-0 place-items-center rounded-[7px] border border-line-strong bg-surface-muted font-mono text-[10px] font-bold tracking-[0.08em]"
          >
            YH
          </span>
          <span className="min-w-0">
            <strong className="block truncate text-sm leading-tight tracking-[-0.01em]">
              Artifact Workbench
            </strong>
            <small className="mt-0.5 hidden truncate font-mono text-[10px] text-subtle md:block">
              {context.title} · {repositoryType}
            </small>
          </span>
        </div>

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
              onClick={() => setMobilePane(pane.id)}
              type="button"
            >
              {pane.label}
            </button>
          ))}
        </nav>
      </header>

      <main
        className="min-h-0 bg-surface md:grid md:grid-cols-[230px_minmax(0,1fr)_var(--detail-pane-width)] lg:grid lg:grid-cols-[270px_minmax(0,1fr)_var(--detail-pane-width)]"
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
          <div
            aria-hidden="true"
            className="grid h-[34px] grid-cols-[88px_minmax(180px,1fr)_104px_72px] items-center gap-3 border-b border-line px-4 font-mono text-[10px] tracking-[0.06em] text-subtle uppercase max-lg:grid-cols-[76px_minmax(160px,1fr)_90px]"
          >
            <span>Type</span>
            <span>Title</span>
            <span>Status</span>
            <span className="max-lg:hidden">Links</span>
          </div>
          <div
            aria-label="Artifact records"
            className="min-h-0 flex-1 overflow-auto"
            role="listbox"
          >
            {visibleEntries.map((entry) => {
              const config = relationConfig[entry.relation];
              const status = getStatus(entry, context);
              const entryRelations = getRelations(entry, context);
              const isSelected = getEntryKey(entry) === selectedKey;

              return (
                <button
                  key={getEntryKey(entry)}
                  aria-selected={isSelected}
                  className="grid min-h-14 w-full grid-cols-[88px_minmax(180px,1fr)_104px_72px] items-center gap-3 border-0 border-b border-line bg-transparent px-4 text-left text-ink hover:bg-hover aria-selected:bg-selected aria-selected:shadow-[inset_2px_0_var(--color-primary)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus focus-visible:outline-none max-lg:grid-cols-[76px_minmax(160px,1fr)_90px]"
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
                  <span className="min-w-0">
                    <strong className="block truncate text-[13px]">
                      {entry.record.title}
                    </strong>
                    <small className="mt-1 block truncate font-mono text-[10px] text-subtle">
                      {getEntryMeta(entry, context)}
                    </small>
                  </span>
                  <span
                    className={`inline-flex w-max rounded-full border px-[7px] py-[3px] font-mono text-[10px] ${getStatusClassName(status)}`}
                  >
                    {status}
                  </span>
                  <span className="font-mono text-[11px] text-subtle max-lg:hidden">
                    {entryRelations.length}
                  </span>
                </button>
              );
            })}
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
          className={`${mobilePane === "detail" ? "flex" : "hidden"} relative min-h-[calc(100dvh-58px)] min-w-0 flex-col bg-[#0f141b] md:flex md:min-h-0`}
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
              /*
            AGENT
            - 화살표 모양의 복사 버튼 필요없는 버튼임. 삭제
            */
              aria-label="Copy deep link"
              className="h-9 min-w-9 rounded-control border border-line bg-surface text-muted focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              onClick={() => void copyDeepLink()}
              type="button"
            >
              {copied ? "✓" : "↗"}
            </button>
          </div>

          <div
            aria-label="Record details"
            className="grid grid-cols-3 border-b border-line"
            role="tablist"
          >
            {detailTabs.map((tab) => (
              <button
                key={tab.id}
                aria-controls={`${tab.id}-panel`}
                aria-selected={detailTab === tab.id}
                className="h-[42px] border-0 border-b-2 border-transparent bg-transparent text-[11px] text-muted aria-selected:border-primary aria-selected:bg-surface aria-selected:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus focus-visible:outline-none"
                onClick={() => setDetailTab(tab.id)}
                role="tab"
                type="button"
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-[18px]">
            {selectedEntry && detailTab === "metadata" ? (
              <section id="metadata-panel" role="tabpanel">
                <p className="mt-0 mb-[9px] font-mono text-[10px] tracking-[0.1em] text-subtle uppercase">
                  Record metadata
                </p>
                <dl className="grid grid-cols-[96px_1fr] gap-x-3 gap-y-2.5 text-xs">
                  <dt className="text-subtle">Type</dt>
                  <dd className="m-0 text-ink">
                    {relationConfig[selectedEntry.relation].label}
                  </dd>
                  <dt className="text-subtle">Status</dt>
                  <dd className="m-0 text-ink">
                    {getStatus(selectedEntry, context)}
                  </dd>
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
                <div className="mt-[18px] border-t border-line pt-4 text-[13px] leading-[1.7] text-[#c4cfdd]">
                  <p className="mt-0 mb-[9px] text-sm font-semibold text-ink">
                    {selectedEntry.record.title}
                  </p>
                  <p className="whitespace-pre-wrap">
                    {getContent(selectedEntry)}
                  </p>
                </div>
              </section>
            ) : null}

            {selectedEntry && detailTab === "relations" ? (
              <section id="relations-panel" role="tabpanel">
                <p className="mt-0 mb-[9px] font-mono text-[10px] tracking-[0.1em] text-subtle uppercase">
                  Connected records
                </p>
                {relations.length > 0 ? (
                  <ul className="m-0 list-none p-0">
                    {relations.map((relation) => (
                      <li
                        key={getEntryKey(relation)}
                        className="flex gap-2.5 border-b border-line py-[11px] text-xs"
                      >
                        <span className="font-mono text-primary">→</span>
                        <span>
                          {relation.record.title}
                          <small className="mt-[3px] block text-subtle">
                            Connected through project context
                          </small>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted">
                    No connected records are available.
                  </p>
                )}
              </section>
            ) : null}

            {selectedEntry && detailTab === "preview" ? (
              <section id="preview-panel" role="tabpanel">
                {getHtmlSelection(selectedEntry) ? (
                  <>
                    <button
                      aria-label={`Open ${relationConfig[selectedEntry.relation].label} preview`}
                      className="mb-2.5 h-[30px] rounded-[5px] border border-primary bg-surface px-3 text-[11px] text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                      onClick={() =>
                        setPreviewSelection(getHtmlSelection(selectedEntry))
                      }
                      type="button"
                    >
                      Open isolated preview
                    </button>
                    <PreviewMock />
                  </>
                ) : (
                  <div className="rounded-card border border-line bg-surface p-4 text-xs leading-6 text-muted">
                    This record is a text artifact. Its content is available in
                    the Metadata tab.
                  </div>
                )}
              </section>
            ) : null}
          </div>
        </aside>
      </main>

      <ArtifactHtmlSidePage
        onClose={() => setPreviewSelection(null)}
        selection={previewSelection}
      />
    </div>
  );
}

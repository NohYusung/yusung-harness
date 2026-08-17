"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useTransition,
  type RefObject,
} from "react";
import {
  ArtifactHtmlSidePage,
  type HtmlArtifactKind,
  type HtmlArtifactSelection,
} from "@/components/features/dashboard/ArtifactHtmlSidePage";
import { ErdDineugPreview } from "@/components/features/dashboard/ErdDineugPreview";
import { formatDashboardDate } from "@/lib/date";
import type {
  Architecture,
  ArtifactDocument,
  ArtifactRecord,
  Domain,
  Draft,
  Erd,
  HtmlArtifactDocument,
  Plan,
  ProjectContext,
  Request,
  Task,
} from "@/types/dashboard";

/** 상단 workspace 메뉴와 URL type query가 공유하는 relation. */
export type WorkspaceRelation =
  | "plans"
  | "drafts"
  | "domains"
  | "architectures"
  | "wireframes"
  | "assets"
  | "designs"
  | "requests"
  | "workLogs"
  | "databases"
  | "erds";

/** ArtifactBrowser의 text 문서와 HTML 문서 record union. */
type WorkspaceArtifact =
  | Plan
  | Draft
  | Domain
  | Architecture
  | Erd
  | Request
  | HtmlArtifactDocument;

/** workspace relation과 해당 relation의 record를 묶은 목록 항목. */
interface ArtifactEntry {
  artifact: WorkspaceArtifact;
  relation: WorkspaceRelation;
}

/** ArtifactBrowser가 URL 선택 상태를 렌더링하는 데 필요한 props. */
interface ArtifactBrowserProps {
  activeRelation: WorkspaceRelation;
  context: ProjectContext;
  selectedArtifactId: number | null;
  selectedTaskId: number | null;
}

/** 현재 detail에 종속된 HTML side preview 선택 key. */
interface HtmlArtifactKey {
  id: number;
  kind: HtmlArtifactKind;
  selectionKey: string;
}

/** Workbench record 목록에서 제공하는 파생 상태 필터. */
type RecordStatusFilter =
  | "All"
  | "Completed"
  | "In progress"
  | "Pending"
  | "Document"
  | "HTML"
  | "Dineug ERD";

/** 우측 record inspector가 노출하는 세부 정보 surface. */
type DetailTab = "metadata" | "relations" | "preview";

const recordStatusFilters: readonly RecordStatusFilter[] = [
  "All",
  "Completed",
  "In progress",
  "Pending",
  "Document",
  "HTML",
  "Dineug ERD",
];

const detailTabs: ReadonlyArray<{ id: DetailTab; label: string }> = [
  { id: "metadata", label: "Metadata" },
  { id: "relations", label: "Relations" },
  { id: "preview", label: "Preview" },
];

/** relation과 record ID로 안정적인 list trigger key를 만든다. */
function getEntryKey(entry: ArtifactEntry): string {
  return `${entry.relation}-${entry.artifact.id}`;
}

/** workspace badge의 짧은 코드, 표시 이름, 색상 token. */
const relationConfig: Record<
  WorkspaceRelation,
  { code: string; label: string; tone: string }
> = {
  plans: { code: "PL", label: "Plan", tone: "bg-primary-soft text-primary" },
  drafts: { code: "DR", label: "Draft", tone: "bg-warning-soft text-warning" },
  domains: {
    code: "DM",
    label: "Domain",
    tone: "bg-primary-soft text-primary",
  },
  architectures: {
    code: "AR",
    label: "Architecture",
    tone: "bg-violet-soft text-violet",
  },
  wireframes: {
    code: "WF",
    label: "Wireframe",
    tone: "bg-teal-soft text-teal",
  },
  assets: {
    code: "AS",
    label: "Asset",
    tone: "bg-warning-soft text-warning",
  },
  designs: {
    code: "DS",
    label: "Design",
    tone: "bg-success-soft text-success",
  },
  requests: {
    code: "RQ",
    label: "Request",
    tone: "bg-primary-soft text-primary",
  },
  workLogs: {
    code: "WL",
    label: "WorkLog",
    tone: "bg-teal-soft text-teal",
  },
  databases: {
    code: "DB",
    label: "DB",
    tone: "bg-warning-soft text-warning",
  },
  erds: {
    code: "ERD",
    label: "ERD",
    tone: "bg-success-soft text-success",
  },
};

/** 프로젝트 컨텍스트에서 현재 workspace relation의 목록을 선택한다. */
function getEntries(
  context: ProjectContext,
  relation: WorkspaceRelation,
): ArtifactEntry[] {
  /** Plan workspace는 계층 탐색에 필요한 Plan record를 제공한다. */
  if (relation === "plans") {
    return context.plans.map((artifact) => ({ artifact, relation }));
  }

  /** Draft workspace는 text 문서 record를 제공한다. */
  if (relation === "drafts") {
    return context.drafts.map((artifact) => ({ artifact, relation }));
  }

  /** Domain workspace는 계층형 비즈니스 Markdown 페이지를 제공한다. */
  if (relation === "domains") {
    return context.domains.map((artifact) => ({ artifact, relation }));
  }

  /** Architecture workspace는 deployment snapshot record를 제공한다. */
  if (relation === "architectures") {
    return context.architectures.map((artifact) => ({ artifact, relation }));
  }

  /** Wireframe workspace는 HTML preview record를 제공한다. */
  if (relation === "wireframes") {
    return context.wireframes.map((artifact) => ({ artifact, relation }));
  }

  /** Design workspace는 HTML preview record를 제공한다. */
  if (relation === "designs") {
    return context.designs.map((artifact) => ({ artifact, relation }));
  }

  /** Request workspace는 lifecycle 상태가 포함된 text 문서를 제공한다. */
  if (relation === "requests") {
    return context.requests.map((artifact) => ({ artifact, relation }));
  }

  /** WorkLog workspace는 작업 이력 Markdown 문서를 제공한다. */
  if (relation === "workLogs") {
    return context.workLogs.map((artifact) => ({ artifact, relation }));
  }

  /** DB workspace는 현행 schema Markdown 문서를 제공한다. */
  if (relation === "databases") {
    return context.databases.map((artifact) => ({ artifact, relation }));
  }

  /** ERD workspace는 현행 schema 관계 Dineug v3 문서를 제공한다. */
  if (relation === "erds") {
    return context.erds.map((artifact) => ({ artifact, relation }));
  }

  /** 남은 Asset workspace는 HTML preview record를 제공한다. */
  return context.assets.map((artifact) => ({ artifact, relation }));
}

/** HTML workspace 여부를 좁혀 text content detail과 preview detail을 분기한다. */
function isHtmlWorkspaceRelation(
  relation: WorkspaceRelation,
): relation is "wireframes" | "assets" | "designs" {
  return (
    relation === "wireframes" ||
    relation === "assets" ||
    relation === "designs"
  );
}

function getEntryMeta(entry: ArtifactEntry): string {
  if (entry.relation === "plans") {
    const plan = entry.artifact as Plan;
    const completed = plan.tasks.filter(
      (task) => task.status === "COMPLETED",
    ).length;
    return `${completed}/${plan.tasks.length} Tasks completed`;
  }

  return `#${entry.artifact.id} · ${formatDashboardDate(entry.artifact.updatedAt)}`;
}

/** Plan의 저장 status와 문서 shape를 목록용 상태 label로 변환한다. */
function getEntryStatus(
  entry: ArtifactEntry,
): Exclude<RecordStatusFilter, "All"> {
  if (entry.relation === "plans") {
    const status = (entry.artifact as Plan).status;

    if (status === "COMPLETED") return "Completed";
    if (status === "IN_PROGRESS") return "In progress";
    return "Pending";
  }

  /** Request는 저장된 lifecycle 상태를 목록 filter label로 변환한다. */
  if (entry.relation === "requests") {
    const status = (entry.artifact as Request).status;

    if (status === "COMPLETED") return "Completed";
    if (status === "IN_PROGRESS") return "In progress";
    return "Pending";
  }

  if (entry.relation === "erds") return "Dineug ERD";
  return isHtmlWorkspaceRelation(entry.relation) ? "HTML" : "Document";
}

/** 검색어를 title, record ID, relation label에 적용한다. */
function entryMatchesQuery(entry: ArtifactEntry, query: string): boolean {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) return true;

  const config = relationConfig[entry.relation];
  return [entry.artifact.title, String(entry.artifact.id), config.label]
    .join(" ")
    .toLocaleLowerCase()
    .includes(normalizedQuery);
}

/** HTML relation을 side preview가 이해하는 kind로 변환한다. */
function getHtmlArtifactKind(
  relation: WorkspaceRelation,
): HtmlArtifactKind {
  if (relation === "wireframes") return "Wireframe";
  if (relation === "designs") return "Design";
  if (relation === "assets") return "Asset";

  throw new Error(`${relation} does not contain an HTML artifact.`);
}

function getHtmlArtifactSelection(
  context: ProjectContext,
  key: HtmlArtifactKey | null,
  selectionKey: string | null,
): HtmlArtifactSelection | null {
  if (!key || key.selectionKey !== selectionKey) {
    return null;
  }

  /** HTML kind마다 project context의 동일 ID record만 선택한다. */
  const record = (() => {
    if (key.kind === "Asset") {
      return context.assets.find((asset) => asset.id === key.id);
    }
    if (key.kind === "Wireframe") {
      return context.wireframes.find((wireframe) => wireframe.id === key.id);
    }
    if (key.kind === "Design") {
      return context.designs.find((design) => design.id === key.id);
    }
    return undefined;
  })();

  return record ? { kind: key.kind, record } : null;
}

function TypeBadge({ relation }: { relation: WorkspaceRelation }) {
  const config = relationConfig[relation];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-micro font-medium ${config.tone}`}
    >
      <span aria-hidden="true" className="font-mono">
        {config.code}
      </span>
      {config.label}
    </span>
  );
}

function RecordMetadata({ record }: { record: ArtifactRecord }) {
  return (
    <dl className="mt-6 border-y text-xs">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-b py-2.5">
        <dt className="font-medium text-subtle">Record ID</dt>
        <dd className="font-mono text-muted">#{record.id}</dd>
      </div>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 border-b py-2.5">
        <dt className="font-medium text-subtle">Created</dt>
        <dd className="font-mono text-muted">
          {formatDashboardDate(record.createdAt)}
        </dd>
      </div>
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3 py-2.5">
        <dt className="font-medium text-subtle">Updated</dt>
        <dd className="font-mono text-muted">
          {formatDashboardDate(record.updatedAt)}
        </dd>
      </div>
    </dl>
  );
}

function RecordContent({ content }: { content: string | null }) {
  return (
    <div className="mt-7">
      <p className="text-xs font-medium text-subtle">Content</p>
      <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
        {content?.trim() || "No additional description."}
      </div>
    </div>
  );
}

function PlanHierarchy({
  onSelectTask,
  plan,
}: {
  onSelectTask: (task: Task) => void;
  plan: Plan;
}) {
  return (
    <section aria-labelledby="plan-hierarchy-heading" className="mt-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-primary">
            Plan hierarchy
          </p>
          <h4 id="plan-hierarchy-heading" className="mt-1 text-base font-semibold text-ink">
            Plan hierarchy
          </h4>
        </div>
        <span className="font-mono text-micro text-subtle">
          {plan.tasks.length} Tasks
        </span>
      </div>

      {plan.tasks.length > 0 ? (
        <ol className="mt-4 space-y-2 border-l pl-4">
          {plan.tasks.map((task, index) => {
            const status = task.status === "COMPLETED" ? "Completed" : "Pending";

            return (
              <li key={task.id} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-5 -left-[1.3rem] size-2 rounded-full border border-primary bg-canvas"
                />
                <button
                  type="button"
                  onClick={() => onSelectTask(task)}
                  className="flex min-h-14 w-full items-center gap-3 rounded-control border bg-canvas px-3 py-2.5 text-left transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none"
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded bg-surface-muted font-mono text-micro text-subtle">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">
                      {task.title}
                    </span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {status}
                    </span>
                  </span>
                  <span aria-hidden="true" className="text-subtle">
                    ›
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="mt-4 rounded-control border border-dashed px-4 py-5 text-sm text-muted">
          No Task records in this Plan.
        </p>
      )}

    </section>
  );
}

function PlanDetails({
  headingRef,
  onSelectTask,
  plan,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSelectTask: (task: Task) => void;
  plan: Plan;
}) {
  return (
    <article className="min-w-0 p-5 sm:p-7">
      <TypeBadge relation="plans" />
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-balance focus-visible:outline-none"
      >
        {plan.title}
      </h3>
      <p className="mt-2 font-mono text-xs text-primary">
        {getEntryStatus({ artifact: plan, relation: "plans" })}
      </p>
      <RecordMetadata record={plan} />
      <RecordContent content={plan.content} />
      <PlanHierarchy
        onSelectTask={onSelectTask}
        plan={plan}
      />
    </article>
  );
}

function TaskDetails({
  headingRef,
  onBack,
  plan,
  task,
}: {
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  plan: Plan;
  task: Task;
}) {
  const status = task.status === "COMPLETED" ? "Completed" : "Pending";

  return (
    <article className="min-w-0 p-5 sm:p-7">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
      >
        <span aria-hidden="true">←</span>
        Back to {plan.title}
      </button>
      <p className="mt-5 font-mono text-micro font-semibold uppercase tracking-[0.14em] text-success">
        Task
      </p>
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-1 text-sm font-semibold text-subtle focus-visible:outline-none"
      >
        Task details
      </h3>
      <h4 className="mt-3 text-2xl font-semibold tracking-[-0.035em] text-balance">
        {task.title}
      </h4>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-success-soft px-2 py-1 font-medium text-success">
          {status}
        </span>
        <span className="font-mono text-subtle">Plan #{task.planId}</span>
      </div>
      <RecordContent content={task.content} />
    </article>
  );
}

function FlatDetails({
  entry,
  headingRef,
}: {
  entry: ArtifactEntry;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const artifact = entry.artifact as ArtifactDocument;

  return (
    <article className="min-w-0 p-5 sm:p-7">
      <TypeBadge relation={entry.relation} />
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-balance focus-visible:outline-none"
      >
        {artifact.title}
      </h3>
      <RecordMetadata record={artifact} />
      <RecordContent content={artifact.content} />
    </article>
  );
}

/** ERD record의 metadata와 읽기 전용 Dineug diagram을 함께 표시한다. */
function ErdArtifactDetails({
  entry,
  headingRef,
}: {
  entry: ArtifactEntry;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const artifact = entry.artifact as Erd;

  return (
    <article className="min-w-0 p-5 sm:p-7">
      <TypeBadge relation="erds" />
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-balance focus-visible:outline-none"
      >
        {artifact.title}
      </h3>
      <RecordMetadata record={artifact} />
      <div className="mt-7 h-[32rem] min-h-72">
        <ErdDineugPreview
          key={`${artifact.id}-${artifact.updatedAt}`}
          record={artifact}
        />
      </div>
    </article>
  );
}

/** Wireframe/Asset/Design의 HTML을 본문 문자열로 노출하지 않고 side preview로 연다. */
function HtmlArtifactDetails({
  entry,
  headingRef,
  onSelectHtmlArtifact,
}: {
  entry: ArtifactEntry;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onSelectHtmlArtifact: (
    kind: HtmlArtifactKind,
    record: HtmlArtifactDocument,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  /** 호출 지점은 HTML relation으로 좁혀졌으므로 preview record로 해석한다. */
  const artifact = entry.artifact as HtmlArtifactDocument;
  /** relation에 대응하는 기존 side preview kind를 선택한다. */
  const kind = getHtmlArtifactKind(entry.relation);

  return (
    <article className="min-w-0 p-5 sm:p-7">
      <TypeBadge relation={entry.relation} />
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-balance focus-visible:outline-none"
      >
        {artifact.title}
      </h3>
      <RecordMetadata record={artifact} />
      <div className="mt-7">
        <p className="text-xs font-medium text-subtle">HTML preview</p>
        <button
          type="button"
          onClick={(event) =>
            onSelectHtmlArtifact(kind, artifact, event.currentTarget)
          }
          className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
        >
          Open {kind} preview
          <span aria-hidden="true">↗</span>
        </button>
      </div>
    </article>
  );
}

function RelationRow({ label, value }: { label: string; value: string }) {
  return (
    <li className="rounded-control border bg-canvas px-3 py-3">
      <p className="font-mono text-micro font-semibold uppercase tracking-[0.12em] text-subtle">
        {label}
      </p>
      <p className="mt-1.5 break-words text-sm font-medium text-ink">{value}</p>
    </li>
  );
}

/** 선택 record의 실제 foreign key와 포함 관계만 inspector에 표시한다. */
function RecordRelations({
  context,
  entry,
}: {
  context: ProjectContext;
  entry: ArtifactEntry;
}) {
  if (entry.relation === "plans") {
    const plan = entry.artifact as Plan;
    const relations = plan.tasks.map((task) => ({
      label: "Task",
      value: task.title,
    }));

    return relations.length > 0 ? (
      <ul className="space-y-2">
        {relations.map((relation, index) => (
          <RelationRow
            key={`${relation.label}-${index}`}
            label={relation.label}
            value={relation.value}
          />
        ))}
      </ul>
    ) : (
      <p className="text-sm leading-6 text-muted">No linked records.</p>
    );
  }

  if (entry.relation === "designs") {
    const design = entry.artifact as ProjectContext["designs"][number];
    return (
      <ul className="space-y-2">
        <RelationRow label="Asset" value={design.asset.title} />
        <RelationRow label="Wireframe" value={design.wireframe.title} />
      </ul>
    );
  }

  return (
    <ul className="space-y-2">
      <RelationRow label="Project" value={context.title} />
    </ul>
  );
}

/** HTML record의 실제 preview 진입점 또는 text record의 명시적 미지원 상태를 렌더한다. */
function RecordPreview({
  entry,
  onSelectHtmlArtifact,
}: {
  entry: ArtifactEntry;
  onSelectHtmlArtifact: (
    kind: HtmlArtifactKind,
    record: HtmlArtifactDocument,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  if (entry.relation === "erds") {
    const artifact = entry.artifact as Erd;
    return (
      <div className="h-[32rem] min-h-72">
        <ErdDineugPreview
          key={`${artifact.id}-${artifact.updatedAt}`}
          record={artifact}
        />
      </div>
    );
  }

  if (!isHtmlWorkspaceRelation(entry.relation)) {
    return (
      <div className="rounded-control border border-dashed bg-canvas px-4 py-5">
        <p className="text-sm font-semibold text-ink">Preview unavailable</p>
        <p className="mt-2 text-sm leading-6 text-muted">
          This record is managed as structured text and has no HTML preview.
        </p>
      </div>
    );
  }

  const artifact = entry.artifact as HtmlArtifactDocument;
  const kind = getHtmlArtifactKind(entry.relation);

  return (
    <div className="rounded-control border bg-canvas px-4 py-5">
      <p className="text-sm font-semibold text-ink">{artifact.title}</p>
      <p className="mt-2 text-sm leading-6 text-muted">
        Open the sandboxed HTML document in the resizable side preview.
      </p>
      <button
        type="button"
        onClick={(event) =>
          onSelectHtmlArtifact(kind, artifact, event.currentTarget)
        }
        className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control bg-primary px-4 py-2 text-sm font-semibold text-canvas transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none"
      >
        Open {kind} preview
        <span aria-hidden="true">↗</span>
      </button>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div className="max-w-sm">
        <span aria-hidden="true" className="font-mono text-2xl text-subtle">
          □
        </span>
        <h3 className="mt-4 text-base font-semibold">No {label} records</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          Records saved by the harness agent will appear here automatically.
        </p>
      </div>
    </div>
  );
}

export function ArtifactBrowser({
  activeRelation,
  context,
  selectedArtifactId,
  selectedTaskId,
}: ArtifactBrowserProps) {
  const router = useRouter();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const entryButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const htmlPreviewTriggerRef = useRef<HTMLButtonElement>(null);
  const pendingListFocusKeyRef = useRef<string | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const headingId = useId();
  const detailTabsId = useId();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] =
    useState<RecordStatusFilter>("All");
  const [detailTab, setDetailTab] = useState<DetailTab>("metadata");
  const [selectedHtmlArtifact, setSelectedHtmlArtifact] =
    useState<HtmlArtifactKey | null>(null);
  const entries = useMemo(
    () => getEntries(context, activeRelation),
    [activeRelation, context],
  );
  const filteredEntries = useMemo(
    () =>
      entries.filter(
        (entry) =>
          entryMatchesQuery(entry, query) &&
          (statusFilter === "All" ||
            getEntryStatus(entry) === statusFilter),
      ),
    [entries, query, statusFilter],
  );
  const selectedEntry = selectedArtifactId
    ? entries.find((entry) => entry.artifact.id === selectedArtifactId) ?? null
    : null;
  const selectedPlan =
    activeRelation === "plans" && selectedEntry
      ? (selectedEntry.artifact as Plan)
      : null;
  const selectedTask =
    selectedPlan && selectedTaskId
      ? selectedPlan.tasks.find((task) => task.id === selectedTaskId) ?? null
      : null;
  const selectionKey = selectedTask
    ? `task-${selectedTask.id}`
    : selectedEntry
      ? `${selectedEntry.relation}-${selectedEntry.artifact.id}`
      : null;
  const [detailScopeKey, setDetailScopeKey] = useState(selectionKey);

  /** prop으로 받은 detail scope가 달라지면 commit 전에 종속 UI 상태를 초기화한다. */
  if (detailScopeKey !== selectionKey) {
    setDetailScopeKey(selectionKey);
    setDetailTab("metadata");
    setSelectedHtmlArtifact(null);
  }

  const scopedHtmlArtifact =
    selectedHtmlArtifact?.selectionKey === selectionKey
      ? selectedHtmlArtifact
      : null;
  const heading = relationConfig[activeRelation].label;
  const htmlArtifactSelection = getHtmlArtifactSelection(
    context,
    scopedHtmlArtifact,
    selectionKey,
  );

  const closeHtmlPreview = useCallback(() => {
    htmlPreviewTriggerRef.current?.focus({ preventScroll: true });
    setSelectedHtmlArtifact(null);
  }, []);

  /** 시안의 Cmd/Ctrl+K 검색 진입과 Escape 초기화 동작을 제공한다. */
  useEffect(() => {
    function handleSearchShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        searchInputRef.current?.focus();
        return;
      }

      if (event.key === "Escape" && document.activeElement === searchInputRef.current) {
        setQuery("");
      }
    }

    document.addEventListener("keydown", handleSearchShortcut);
    return () => document.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  useEffect(() => {
    if (selectionKey && detailTab === "metadata") {
      detailHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [detailTab, selectionKey]);

  useEffect(() => {
    const pendingKey = pendingListFocusKeyRef.current;
    if (selectedEntry || !pendingKey) return;

    entryButtonRefs.current.get(pendingKey)?.focus({ preventScroll: true });
    pendingListFocusKeyRef.current = null;
  }, [selectedEntry]);

  function selectHtmlArtifact(
    kind: HtmlArtifactKind,
    record: HtmlArtifactDocument,
    trigger: HTMLButtonElement,
  ) {
    htmlPreviewTriggerRef.current = trigger;
    if (selectionKey) {
      setSelectedHtmlArtifact({ id: record.id, kind, selectionKey });
    }
  }

  function navigateToEntry(entry: ArtifactEntry) {
    setSelectedHtmlArtifact(null);
    pendingListFocusKeyRef.current = null;
    startTransition(() =>
      router.replace(
        `/projects/${context.id}?type=${entry.relation}&id=${entry.artifact.id}`,
        { scroll: false },
      ),
    );
  }

  function navigateToTask(plan: Plan, task: Task) {
    setSelectedHtmlArtifact(null);
    startTransition(() =>
      router.replace(
        `/projects/${context.id}?type=plans&id=${plan.id}&taskId=${task.id}`,
        { scroll: false },
      ),
    );
  }

  function navigateBackToPlan(plan: Plan) {
    setSelectedHtmlArtifact(null);
    startTransition(() =>
      router.replace(`/projects/${context.id}?type=plans&id=${plan.id}`, {
        scroll: false,
      }),
    );
  }

  function closeEntry() {
    setSelectedHtmlArtifact(null);
    if (selectedEntry) {
      const selectedEntryKey = getEntryKey(selectedEntry);
      pendingListFocusKeyRef.current = selectedEntryKey;
      entryButtonRefs.current
        .get(selectedEntryKey)
        ?.focus({ preventScroll: true });
    }
    startTransition(() =>
      router.replace(`/projects/${context.id}?type=${activeRelation}`, {
        scroll: false,
      }),
    );
  }

  return (
    <>
      <section
        aria-labelledby={headingId}
        aria-busy={isPending}
        className="flex min-h-0 flex-1 flex-col bg-surface"
      >
        <div className="flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3 sm:px-6">
          <div>
            <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-primary">
              Artifact Workbench
            </p>
            <h2 id={headingId} className="mt-1 text-lg font-semibold">
              {heading}{" "}
              <span className="ml-2 font-mono text-sm font-normal text-muted">
                {entries.length}
              </span>
            </h2>
          </div>
          <span className="hidden text-xs text-subtle sm:block">
            {isPending ? "Loading…" : "Select a record to inspect"}
          </span>
        </div>

        <form
          role="search"
          className="grid shrink-0 gap-2 border-b bg-surface-muted/40 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_auto] sm:px-5"
          onSubmit={(event) => event.preventDefault()}
        >
          <label className="relative block">
            <span className="sr-only">Search {heading} records</span>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-subtle"
            >
              ⌕
            </span>
            <input
              ref={searchInputRef}
              aria-label={`Search ${heading} records`}
              className="min-h-11 w-full rounded-control border bg-canvas py-2 pr-12 pl-9 text-sm text-ink placeholder:text-subtle focus:border-primary focus:ring-2 focus:ring-focus/30 focus:outline-none"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search title, type, or ID"
              type="search"
              value={query}
            />
            <kbd className="pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 rounded border bg-surface px-1.5 py-0.5 font-mono text-micro text-subtle md:inline">
              ⌘K
            </kbd>
          </label>
          <label>
            <span className="sr-only">Record status</span>
            <select
              aria-label="Record status"
              className="min-h-11 w-full rounded-control border bg-canvas px-3 text-sm text-muted focus:border-primary focus:ring-2 focus:ring-focus/30 focus:outline-none"
              onChange={(event) =>
                setStatusFilter(event.target.value as RecordStatusFilter)
              }
              value={statusFilter}
            >
              {recordStatusFilters.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <p
            aria-live="polite"
            className="self-center font-mono text-xs whitespace-nowrap text-subtle"
          >
            {filteredEntries.length} visible
          </p>
        </form>

        <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(20rem,1fr)_22.5rem] xl:grid-cols-[minmax(22rem,1fr)_24rem]">
          <div
            className={`min-h-0 min-w-0 overflow-y-auto border-r-0 lg:block lg:border-r ${selectedEntry ? "hidden" : "block"}`}
          >
            {entries.length === 0 ? (
              <EmptyState label={heading} />
            ) : filteredEntries.length === 0 ? (
              <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
                <div className="max-w-sm">
                  <h3 className="text-base font-semibold">No matching records</h3>
                  <p className="mt-2 text-sm leading-6 text-muted">
                    Adjust the search query or status filter.
                  </p>
                </div>
              </div>
            ) : (
              <ul aria-label={`${heading} list`} className="divide-y">
                {filteredEntries.map((entry) => {
                  const isSelected = entry.artifact.id === selectedArtifactId;
                  const status = getEntryStatus(entry);

                  return (
                    <li key={getEntryKey(entry)}>
                      <button
                        ref={(node) => {
                          const entryKey = getEntryKey(entry);
                          if (node) entryButtonRefs.current.set(entryKey, node);
                          else entryButtonRefs.current.delete(entryKey);
                        }}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => navigateToEntry(entry)}
                        className={`w-full border-l-2 px-5 py-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none ${
                          isSelected
                            ? "border-primary bg-selected"
                            : "border-transparent hover:bg-hover"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-ink">
                              {entry.artifact.title}
                            </p>
                            <p className="mt-1 truncate text-xs text-muted">
                              {getEntryMeta(entry)}
                            </p>
                            <span className="mt-2 inline-flex rounded-full bg-surface-muted px-2 py-0.5 font-mono text-micro text-subtle">
                              {status}
                            </span>
                          </div>
                          <span aria-hidden="true" className="mt-1 text-subtle">
                            ›
                          </span>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <section
            aria-label="Record inspector"
            className={`${selectedEntry ? "block" : "hidden lg:flex"} min-h-0 min-w-0 flex-col overflow-y-auto bg-surface`}
          >
            {selectedEntry ? (
              <div className="w-full">
                <div className="border-b px-5 py-3 lg:hidden">
                  <button
                    type="button"
                    onClick={closeEntry}
                    className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  >
                    <span aria-hidden="true">←</span>
                    Back to list
                  </button>
                </div>

                <div className="border-b px-4 pt-4">
                  <p className="truncate px-1 text-sm font-semibold text-ink">
                    {selectedTask?.title ?? selectedEntry.artifact.title}
                  </p>
                  <div
                    aria-label="Record details"
                    className="mt-3 grid grid-cols-3"
                    role="tablist"
                  >
                    {detailTabs.map((tab) => (
                      <button
                        key={tab.id}
                        aria-controls={`${detailTabsId}-${tab.id}-panel`}
                        aria-selected={detailTab === tab.id}
                        className={`min-h-11 border-b-2 px-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none ${
                          detailTab === tab.id
                            ? "border-primary text-primary"
                            : "border-transparent text-muted hover:text-ink"
                        }`}
                        id={`${detailTabsId}-${tab.id}-tab`}
                        onClick={() => setDetailTab(tab.id)}
                        role="tab"
                        type="button"
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {detailTab === "metadata" ? (
                  <div
                    aria-labelledby={`${detailTabsId}-metadata-tab`}
                    id={`${detailTabsId}-metadata-panel`}
                    role="tabpanel"
                  >
                    {selectedPlan ? (
                      selectedTask ? (
                        <TaskDetails
                          headingRef={detailHeadingRef}
                          onBack={() => navigateBackToPlan(selectedPlan)}
                          plan={selectedPlan}
                          task={selectedTask}
                        />
                      ) : (
                        <PlanDetails
                          headingRef={detailHeadingRef}
                          onSelectTask={(task) => navigateToTask(selectedPlan, task)}
                          plan={selectedPlan}
                        />
                      )
                    ) : selectedEntry.relation === "erds" ? (
                      <ErdArtifactDetails
                        entry={selectedEntry}
                        headingRef={detailHeadingRef}
                      />
                    ) : isHtmlWorkspaceRelation(selectedEntry.relation) ? (
                      <HtmlArtifactDetails
                        entry={selectedEntry}
                        headingRef={detailHeadingRef}
                        onSelectHtmlArtifact={selectHtmlArtifact}
                      />
                    ) : (
                      <FlatDetails
                        entry={selectedEntry}
                        headingRef={detailHeadingRef}
                      />
                    )}
                  </div>
                ) : detailTab === "relations" ? (
                  <div
                    aria-labelledby={`${detailTabsId}-relations-tab`}
                    className="p-5"
                    id={`${detailTabsId}-relations-panel`}
                    role="tabpanel"
                  >
                    <RecordRelations context={context} entry={selectedEntry} />
                  </div>
                ) : (
                  <div
                    aria-labelledby={`${detailTabsId}-preview-tab`}
                    className="p-5"
                    id={`${detailTabsId}-preview-panel`}
                    role="tabpanel"
                  >
                    <RecordPreview
                      entry={selectedEntry}
                      onSelectHtmlArtifact={selectHtmlArtifact}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div className="m-auto max-w-sm px-8 py-16 text-center">
                <span aria-hidden="true" className="font-mono text-2xl text-subtle">
                  ↗
                </span>
                <h3 className="mt-4 text-base font-semibold">Select a record</h3>
                <p className="mt-2 text-sm leading-6 text-muted">
                  Choose a record from the list to inspect metadata, relations,
                  and previews.
                </p>
              </div>
            )}
          </section>
        </div>
      </section>
      <ArtifactHtmlSidePage
        onClose={closeHtmlPreview}
        selection={htmlArtifactSelection}
      />
    </>
  );
}

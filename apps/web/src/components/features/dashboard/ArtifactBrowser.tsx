"use client";

import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useTransition,
  type RefObject,
} from "react";
import { formatDashboardDate } from "@/lib/date";
import type { ProjectContext } from "@/types/dashboard";

export type ArtifactRelation =
  | "plans"
  | "tasks"
  | "drafts"
  | "architectures"
  | "wireframes"
  | "assets"
  | "designs"
  | "reviews";

type Artifact = ProjectContext[ArtifactRelation][number];

interface ArtifactEntry {
  artifact: Artifact;
  relation: ArtifactRelation;
}

interface ArtifactBrowserProps {
  activeRelation: ArtifactRelation | null;
  context: ProjectContext;
  selectedArtifactId: number | null;
}

interface RelationConfig {
  code: string;
  emptySubject: string;
  label: string;
  singular: string;
  tone: string;
}

const relationConfig: Record<ArtifactRelation, RelationConfig> = {
  plans: {
    code: "PL",
    emptySubject: "계획이",
    label: "계획",
    singular: "계획",
    tone: "bg-primary-soft text-primary",
  },
  tasks: {
    code: "TK",
    emptySubject: "작업이",
    label: "작업",
    singular: "작업",
    tone: "bg-success-soft text-success",
  },
  drafts: {
    code: "DR",
    emptySubject: "초안이",
    label: "초안",
    singular: "초안",
    tone: "bg-warning-soft text-warning",
  },
  architectures: {
    code: "AR",
    emptySubject: "아키텍처가",
    label: "아키텍처",
    singular: "아키텍처",
    tone: "bg-violet-soft text-violet",
  },
  wireframes: {
    code: "WF",
    emptySubject: "와이어프레임이",
    label: "와이어프레임",
    singular: "와이어프레임",
    tone: "bg-teal-soft text-teal",
  },
  assets: {
    code: "AS",
    emptySubject: "에셋이",
    label: "에셋",
    singular: "에셋",
    tone: "bg-warning-soft text-warning",
  },
  designs: {
    code: "DS",
    emptySubject: "디자인이",
    label: "디자인",
    singular: "디자인",
    tone: "bg-teal-soft text-teal",
  },
  reviews: {
    code: "RV",
    emptySubject: "리뷰가",
    label: "리뷰",
    singular: "리뷰",
    tone: "bg-violet-soft text-violet",
  },
};

const relations = [
  "plans",
  "tasks",
  "drafts",
  "architectures",
  "wireframes",
  "assets",
  "designs",
  "reviews",
] as const satisfies readonly ArtifactRelation[];

function toEntries(
  relation: ArtifactRelation,
  artifacts: Artifact[],
): ArtifactEntry[] {
  return artifacts.map((artifact) => ({ artifact, relation }));
}

function getRelationEntries(
  context: ProjectContext,
  relation: ArtifactRelation,
): ArtifactEntry[] {
  switch (relation) {
    case "plans":
      return toEntries(relation, context.plans);
    case "tasks":
      return toEntries(relation, context.tasks);
    case "drafts":
      return toEntries(relation, context.drafts);
    case "architectures":
      return toEntries(relation, context.architectures);
    case "wireframes":
      return toEntries(relation, context.wireframes);
    case "assets":
      return toEntries(relation, context.assets);
    case "designs":
      return toEntries(relation, context.designs);
    case "reviews":
      return toEntries(relation, context.reviews);
  }
}

function getRecentEntries(context: ProjectContext): ArtifactEntry[] {
  return relations
    .flatMap((relation) => getRelationEntries(context, relation))
    .sort(
      (left, right) =>
        new Date(right.artifact.updatedAt).getTime() -
        new Date(left.artifact.updatedAt).getTime(),
    )
    .slice(0, 16);
}

function getArtifactMeta(entry: ArtifactEntry): string {
  switch (entry.relation) {
    case "plans": {
      const plan = entry.artifact as ProjectContext["plans"][number];
      const completed = plan.tasks.filter(
        (task) => task.status === "COMPLETED",
      ).length;
      return `v${plan.version} · 작업 ${completed}/${plan.tasks.length} 완료`;
    }
    case "tasks": {
      const task = entry.artifact as ProjectContext["tasks"][number];
      return `${task.status === "COMPLETED" ? "완료" : "대기"} · plan #${task.planId}`;
    }
    case "designs": {
      const design = entry.artifact as ProjectContext["designs"][number];
      return `${design.wireframe.title} · ${design.asset.title}`;
    }
    default:
      return `#${entry.artifact.id} · ${formatDashboardDate(entry.artifact.updatedAt)}`;
  }
}

function ArtifactTypeBadge({ relation }: { relation: ArtifactRelation }) {
  const config = relationConfig[relation];

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-micro font-semibold ${config.tone}`}
    >
      <span aria-hidden="true" className="font-mono">
        {config.code}
      </span>
      {config.singular}
    </span>
  );
}

function ArtifactEmptyState({
  activeRelation,
  isProjectEmpty,
}: {
  activeRelation: ArtifactRelation | null;
  isProjectEmpty: boolean;
}) {
  const title = isProjectEmpty
    ? "아직 저장된 산출물이 없습니다"
    : `저장된 ${activeRelation ? relationConfig[activeRelation].emptySubject : "최근 산출물이"} 없습니다`;

  return (
    <div className="grid min-h-72 place-items-center px-6 py-12 text-center">
      <div className="max-w-sm">
        <span
          aria-hidden="true"
          className="mx-auto grid size-11 place-items-center rounded-card bg-surface-muted font-mono text-sm font-semibold text-muted"
        >
          0
        </span>
        <h3 className="mt-4 text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-muted">
          하네스 에이전트가 산출물을 저장하면 별도 작업 없이 이곳에 표시됩니다.
        </p>
      </div>
    </div>
  );
}

function ArtifactDetail({
  entry,
  headingRef,
}: {
  entry: ArtifactEntry;
  headingRef: RefObject<HTMLHeadingElement | null>;
}) {
  const content = entry.artifact.content?.trim();

  return (
    <article className="min-w-0 p-5 sm:p-7">
      <ArtifactTypeBadge relation={entry.relation} />
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="mt-4 text-2xl font-semibold tracking-[-0.035em] text-balance focus-visible:outline-none"
      >
        {entry.artifact.title}
      </h3>
      <dl className="mt-5 grid gap-3 rounded-card border bg-canvas p-4 text-xs sm:grid-cols-3">
        <div>
          <dt className="font-medium text-muted">Record ID</dt>
          <dd className="mt-1 font-mono text-ink">#{entry.artifact.id}</dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Created</dt>
          <dd className="mt-1 font-mono text-ink">
            {formatDashboardDate(entry.artifact.createdAt)}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-muted">Updated</dt>
          <dd className="mt-1 font-mono text-ink">
            {formatDashboardDate(entry.artifact.updatedAt)}
          </dd>
        </div>
      </dl>

      {entry.relation === "designs" ? (
        <div className="mt-5 flex flex-wrap gap-2 text-xs text-muted">
          <span className="rounded-control bg-teal-soft px-2.5 py-1.5 text-teal">
            Wireframe · {(entry.artifact as ProjectContext["designs"][number]).wireframe.title}
          </span>
          <span className="rounded-control bg-warning-soft px-2.5 py-1.5 text-warning">
            Asset · {(entry.artifact as ProjectContext["designs"][number]).asset.title}
          </span>
        </div>
      ) : null}

      <div className="mt-7 border-t pt-6">
        <p className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
          Content
        </p>
        <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-ink">
          {content || "추가 설명이 없습니다."}
        </div>
      </div>
    </article>
  );
}

export function ArtifactBrowser({
  activeRelation,
  context,
  selectedArtifactId,
}: ArtifactBrowserProps) {
  const router = useRouter();
  const detailHeadingRef = useRef<HTMLHeadingElement>(null);
  const [isPending, startTransition] = useTransition();
  const allEntries = getRecentEntries(context);
  const entries = activeRelation
    ? getRelationEntries(context, activeRelation)
    : allEntries;
  const selectedEntry =
    activeRelation && selectedArtifactId
      ? entries.find((entry) => entry.artifact.id === selectedArtifactId) ?? null
      : null;
  const selectedEntryKey = selectedEntry
    ? `${selectedEntry.relation}-${selectedEntry.artifact.id}`
    : null;
  const heading = activeRelation
    ? relationConfig[activeRelation].label
    : "최근 산출물";
  const totalArtifactCount = relations.reduce(
    (total, relation) => total + context[relation].length,
    0,
  );

  useEffect(() => {
    if (selectedEntryKey) {
      detailHeadingRef.current?.focus({ preventScroll: true });
    }
  }, [selectedEntryKey]);

  function navigateToRelation(relation: ArtifactRelation | null) {
    const href = relation
      ? `/projects/${context.id}?type=${relation}`
      : `/projects/${context.id}`;
    startTransition(() => router.push(href, { scroll: false }));
  }

  function navigateToArtifact(entry: ArtifactEntry) {
    startTransition(() =>
      router.replace(
        `/projects/${context.id}?type=${entry.relation}&id=${entry.artifact.id}`,
        { scroll: false },
      ),
    );
  }

  function closeArtifact() {
    const href = activeRelation
      ? `/projects/${context.id}?type=${activeRelation}`
      : `/projects/${context.id}`;
    startTransition(() => router.replace(href, { scroll: false }));
  }

  return (
    <section
      aria-labelledby="artifact-browser-heading"
      aria-busy={isPending}
      className="mt-6 overflow-hidden rounded-card border bg-surface shadow-card"
    >
      <div className="flex items-center justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">
            Artifact browser
          </p>
          <h2 id="artifact-browser-heading" className="mt-1 text-lg font-semibold">
            {heading}
            {" "}
            <span className="ml-2 font-mono text-sm font-normal text-muted">
              {entries.length}
            </span>
          </h2>
        </div>
        {isPending ? (
          <span role="status" className="text-xs font-medium text-muted">
            이동 중…
          </span>
        ) : (
          <span className="hidden text-xs text-muted sm:block">
            항목을 선택해 내용을 확인하세요
          </span>
        )}
      </div>

      <nav aria-label="모바일 산출물 유형" className="border-b p-3 lg:hidden">
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            aria-pressed={activeRelation === null}
            onClick={() => navigateToRelation(null)}
            className={`min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none motion-reduce:transition-none ${
              activeRelation === null
                ? "bg-primary text-white"
                : "bg-surface-muted text-muted hover:text-ink"
            }`}
          >
            최근
          </button>
          {relations.map((relation) => {
            const config = relationConfig[relation];
            const isActive = activeRelation === relation;
            return (
              <button
                key={relation}
                type="button"
                aria-pressed={isActive}
                onClick={() => navigateToRelation(relation)}
                className={`min-h-11 shrink-0 rounded-control px-3 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none motion-reduce:transition-none ${
                  isActive
                    ? "bg-primary text-white"
                    : "bg-surface-muted text-muted hover:text-ink"
                }`}
              >
                {config.label}
                {" "}
                <span className="ml-1.5 font-mono text-xs opacity-70">
                  {context[relation].length}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      <div className="md:grid md:min-h-[36rem] md:grid-cols-[minmax(17rem,0.72fr)_minmax(0,1.28fr)]">
        <div
          className={`min-w-0 border-r-0 md:block md:border-r ${selectedEntry ? "hidden" : "block"}`}
        >
          {entries.length === 0 ? (
            <ArtifactEmptyState
              activeRelation={activeRelation}
              isProjectEmpty={totalArtifactCount === 0}
            />
          ) : (
            <ul aria-label={`${heading} 목록`} className="divide-y">
              {entries.map((entry) => {
                const isSelected =
                  entry.relation === activeRelation &&
                  entry.artifact.id === selectedArtifactId;
                return (
                  <li key={`${entry.relation}-${entry.artifact.id}`}>
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => navigateToArtifact(entry)}
                      className={`w-full px-5 py-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset focus-visible:outline-none motion-reduce:transition-none ${
                        isSelected
                          ? "bg-primary-soft"
                          : "hover:bg-surface-muted/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          {activeRelation === null ? (
                            <ArtifactTypeBadge relation={entry.relation} />
                          ) : null}
                          <p className={`${activeRelation === null ? "mt-2" : ""} truncate text-sm font-semibold text-ink`}>
                            {entry.artifact.title}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted">
                            {getArtifactMeta(entry)}
                          </p>
                        </div>
                        <span aria-hidden="true" className="mt-1 text-muted">
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

        <div className={`${selectedEntry ? "block" : "hidden md:flex"} min-w-0`}>
          {selectedEntry ? (
            <div className="w-full">
              <div className="border-b px-5 py-3 md:hidden">
                <button
                  type="button"
                  onClick={closeArtifact}
                  className="inline-flex min-h-11 items-center gap-2 rounded-control px-2 text-sm font-semibold text-primary focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                >
                  <span aria-hidden="true">←</span>
                  목록으로
                </button>
              </div>
              <ArtifactDetail
                entry={selectedEntry}
                headingRef={detailHeadingRef}
              />
            </div>
          ) : (
            <div className="m-auto max-w-sm px-8 py-16 text-center">
              <span
                aria-hidden="true"
                className="mx-auto grid size-11 place-items-center rounded-card bg-primary-soft font-mono text-sm font-semibold text-primary"
              >
                ↗
              </span>
              <h3 className="mt-4 text-base font-semibold">
                살펴볼 항목을 선택하세요
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted">
                목록의 산출물을 선택하면 원문과 연결 정보를 이 패널에서 확인할 수
                있습니다.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  getLatestDomainErd,
  type DomainEntity,
  type DomainField,
  type DomainRelationship,
} from "@/lib/domain-erd";
import { formatDashboardDate } from "@/lib/date";
import type { Domain } from "@/types/dashboard";

/** Domain workspace가 소비하는 프로젝트 단위 ERD record 목록. */
interface DomainWorkspaceProps {
  domains: Domain[];
}

/** Canvas 안에 배치된 entity node와 좌표. */
interface PositionedEntity {
  entity: DomainEntity;
  height: number;
  width: number;
  x: number;
  y: number;
}

/** 모든 entity node를 포함하는 ERD canvas 크기와 배치 결과. */
interface ErdLayout {
  entities: PositionedEntity[];
  height: number;
  width: number;
}

const entityWidth = 244;
const entityHeaderHeight = 66;
const fieldHeight = 30;
const horizontalGap = 128;
const verticalGap = 72;
const canvasPadding = 48;

/** 영문 count label을 단수/복수 형태로 만든다. */
function pluralize(count: number, singular: string): string {
  const plural = singular.endsWith("y")
    ? `${singular.slice(0, -1)}ies`
    : `${singular}s`;

  return `${count} ${count === 1 ? singular : plural}`;
}

/** Canvas 가용 폭을 55~100% 범위의 fit zoom으로 변환한다. */
function getFitZoom(availableWidth: number, layoutWidth: number): number {
  return Math.max(0.55, Math.min(1, (availableWidth - 32) / layoutWidth));
}

/** Entity 수와 field 높이를 반영해 ERD canvas 좌표를 계산한다. */
function createLayout(entities: DomainEntity[]): ErdLayout {
  const columnCount = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(entities.length))));
  const rows: DomainEntity[][] = [];

  for (let index = 0; index < entities.length; index += columnCount) {
    rows.push(entities.slice(index, index + columnCount));
  }

  const rowHeights = rows.map((row) =>
    Math.max(
      ...row.map(
        (entity) => entityHeaderHeight + entity.fields.length * fieldHeight,
      ),
    ),
  );
  const positionedEntities: PositionedEntity[] = [];
  let y = canvasPadding;

  rows.forEach((row, rowIndex) => {
    row.forEach((entity, columnIndex) => {
      positionedEntities.push({
        entity,
        width: entityWidth,
        height: entityHeaderHeight + entity.fields.length * fieldHeight,
        x: canvasPadding + columnIndex * (entityWidth + horizontalGap),
        y,
      });
    });
    y += (rowHeights[rowIndex] ?? 0) + verticalGap;
  });

  return {
    entities: positionedEntities,
    height: Math.max(440, y - verticalGap + canvasPadding),
    width:
      canvasPadding * 2 +
      columnCount * entityWidth +
      Math.max(0, columnCount - 1) * horizontalGap,
  };
}

/** 관계 endpoint를 접근 가능한 한 줄 설명으로 변환한다. */
function getRelationshipCopy(
  relationship: DomainRelationship,
  entitiesById: Map<string, DomainEntity>,
): string {
  const source = entitiesById.get(relationship.source.entityId);
  const target = entitiesById.get(relationship.target.entityId);

  const sourceName = `${source?.name ?? relationship.source.entityId}${
    relationship.source.field ? `.${relationship.source.field}` : ""
  }`;
  const targetName = `${target?.name ?? relationship.target.entityId}${
    relationship.target.field ? `.${relationship.target.field}` : ""
  }`;
  const relation = `${sourceName} ${relationship.source.cardinality} → ${relationship.target.cardinality} ${targetName}`;

  return relationship.label ? `${relation} · ${relationship.label}` : relation;
}

/** PK/FK/UQ 속성을 field badge로 렌더한다. */
function FieldKey({ field }: { field: DomainField }) {
  const keys = [
    field?.primaryKey ? "PK" : null,
    field?.foreignKey ? "FK" : null,
    field?.unique && !field.primaryKey ? "UQ" : null,
  ].filter((key): key is string => key !== null);

  return keys.length > 0 ? (
    <span className="flex shrink-0 items-center gap-1">
      {keys.map((key) => (
        <span
          key={key}
          className="rounded bg-violet-soft px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-violet"
        >
          {key}
        </span>
      ))}
    </span>
  ) : (
    <span aria-hidden="true" className="w-6 shrink-0" />
  );
}

/** Entity node 사이의 relationship curve와 cardinality를 그린다. */
function RelationshipLines({
  entities,
  relationships,
  selectedEntityId,
}: {
  entities: PositionedEntity[];
  relationships: DomainRelationship[];
  selectedEntityId: string | null;
}) {
  const positions = new Map(entities.map((entity) => [entity.entity.id, entity]));

  return (
    <svg aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
      {relationships.map((relationship) => {
        const source = positions.get(relationship.source.entityId);
        const target = positions.get(relationship.target.entityId);
        if (!source || !target) return null;

        const sourceCenter = {
          x: source.x + source.width / 2,
          y: source.y + source.height / 2,
        };
        const targetCenter = {
          x: target.x + target.width / 2,
          y: target.y + target.height / 2,
        };
        const travelsRight = sourceCenter.x <= targetCenter.x;
        const x1 = travelsRight ? source.x + source.width : source.x;
        const x2 = travelsRight ? target.x : target.x + target.width;
        const curve = Math.max(56, Math.abs(x2 - x1) * 0.45);
        const control1 = travelsRight ? x1 + curve : x1 - curve;
        const control2 = travelsRight ? x2 - curve : x2 + curve;
        const isActive =
          !selectedEntityId ||
          relationship.source.entityId === selectedEntityId ||
          relationship.target.entityId === selectedEntityId;
        const opacity = selectedEntityId
          ? isActive
            ? "opacity-100"
            : "opacity-15"
          : "opacity-45";

        return (
          <g key={relationship.id} className={opacity}>
            <path
              d={`M ${x1} ${sourceCenter.y} C ${control1} ${sourceCenter.y}, ${control2} ${targetCenter.y}, ${x2} ${targetCenter.y}`}
              fill="none"
              stroke="var(--color-violet)"
              strokeOpacity="0.72"
              strokeWidth="1.5"
            />
            <circle cx={x1} cy={sourceCenter.y} fill="var(--color-canvas)" r="3" stroke="var(--color-violet)" />
            <circle cx={x2} cy={targetCenter.y} fill="var(--color-violet)" r="3" />
            <text
              fill="var(--color-violet)"
              fontFamily="var(--font-mono)"
              fontSize="11"
              textAnchor={travelsRight ? "start" : "end"}
              x={travelsRight ? x1 + 9 : x1 - 9}
              y={sourceCenter.y - 8}
            >
              {relationship.source.cardinality}
            </text>
            <text
              fill="var(--color-violet)"
              fontFamily="var(--font-mono)"
              fontSize="11"
              textAnchor={travelsRight ? "end" : "start"}
              x={travelsRight ? x2 - 9 : x2 + 9}
              y={targetCenter.y - 8}
            >
              {relationship.target.cardinality}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** 구조화되지 않은 legacy Domain record 원문을 보존해 보여준다. */
function LegacyRecords({ records }: { records: Domain[] }) {
  if (records.length === 0) return null;

  return (
    <section aria-labelledby="legacy-records-heading" className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 id="legacy-records-heading" className="text-sm font-semibold text-ink">
          Legacy records
        </h3>
        <span className="font-mono text-micro text-subtle">{records.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {records.map((record) => (
          <details key={record.id} className="rounded-control border bg-canvas">
            <summary className="cursor-pointer px-3 py-2.5 text-xs font-semibold text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none">
              {record.title}
            </summary>
            <div className="border-t px-3 py-3">
              <p className="font-mono text-micro text-subtle">
                Updated {formatDashboardDate(record.updatedAt)}
              </p>
              <p className="mt-3 whitespace-pre-wrap break-words text-xs leading-6 text-muted">
                {record.content}
              </p>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Domain snapshot 부재와 legacy-only 상태를 구분해 안내한다. */
function EmptyDomain({ domains }: { domains: Domain[] }) {
  if (domains.length > 0) {
    return (
      <section
        role="alert"
        className="min-h-0 flex-1 overflow-y-auto bg-warning-soft p-6 sm:p-8"
      >
        <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-warning">
          Legacy domain
        </p>
        <h2 className="mt-3 text-xl font-semibold">ERD snapshot unavailable</h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          {pluralize(domains.length, "Domain record")} use the legacy text
          format. The architect agent must save a structured domain-erd snapshot
          before this project can be rendered as an ERD.
        </p>
        <LegacyRecords records={domains} />
      </section>
    );
  }

  return (
    <section className="grid min-h-0 flex-1 place-items-center overflow-y-auto bg-surface px-6 text-center">
      <div className="grid min-h-[28rem] max-w-md place-content-center py-12">
        <span aria-hidden="true" className="font-mono text-3xl text-violet">
          ◇
        </span>
        <h2 className="mt-4 text-xl font-semibold">No domain model yet</h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The domain model appears after the completed project is analyzed by
          the architect agent.
        </p>
      </div>
    </section>
  );
}

/** 최신 Domain ERD snapshot과 legacy record를 독립 workspace로 렌더한다. */
export function DomainWorkspace({ domains }: DomainWorkspaceProps) {
  const latest = useMemo(
    () => getLatestDomainErd(domains),
    [domains],
  );
  const [query, setQuery] = useState("");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);
  const entityButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const snapshot = latest?.snapshot ?? null;
  const layout = useMemo(
    () => createLayout(snapshot?.entities ?? []),
    [snapshot],
  );
  const entitiesById = useMemo(
    () => new Map(snapshot?.entities.map((entity) => [entity.id, entity]) ?? []),
    [snapshot],
  );
  const selectedEntity = selectedEntityId
    ? entitiesById.get(selectedEntityId) ?? null
    : null;
  const activeEntityId = selectedEntity?.id ?? null;
  const selectedRelationships = snapshot
    ? snapshot.relationships.filter(
        (relationship) =>
          relationship.source.entityId === activeEntityId ||
          relationship.target.entityId === activeEntityId,
      )
    : [];
  const normalizedQuery = query.trim().toLocaleLowerCase();

  useEffect(() => {
    if (!activeEntityId) return;
    const selectedId = activeEntityId;

    function clearSelection(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const trigger = entityButtonRefs.current.get(selectedId);
      trigger?.focus();
      setSelectedEntityId(null);
    }

    document.addEventListener("keydown", clearSelection);
    return () => document.removeEventListener("keydown", clearSelection);
  }, [activeEntityId]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!snapshot || !canvas) return;

    const fitToCanvas = () => {
      const availableWidth = canvas.clientWidth;
      if (availableWidth <= 0) return;

      setZoom(getFitZoom(availableWidth, layout.width));
    };

    fitToCanvas();

    if (typeof ResizeObserver === "undefined") return;

    const resizeObserver = new ResizeObserver(fitToCanvas);
    resizeObserver.observe(canvas);

    return () => resizeObserver.disconnect();
  }, [layout.width, snapshot]);

  if (!latest || !snapshot) {
    return <EmptyDomain domains={domains} />;
  }

  const countCopy = `${pluralize(snapshot.entities.length, "entity")} · ${pluralize(snapshot.relationships.length, "relationship")}`;
  const scaledWidth = Math.round(layout.width * zoom);
  const scaledHeight = Math.round(layout.height * zoom);

  function fitDiagram() {
    const availableWidth = canvasRef.current?.clientWidth ?? layout.width;
    setZoom(getFitZoom(availableWidth, layout.width));
  }

  return (
    <section aria-labelledby="domain-model-heading" className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="flex shrink-0 flex-col gap-5 border-b px-5 py-5 sm:px-6 2xl:flex-row 2xl:items-end 2xl:justify-between">
        <div>
          <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-violet">
            Domain
          </p>
          <h2 id="domain-model-heading" className="mt-1 text-xl font-semibold">
            Domain model
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{countCopy}</span>
            <span aria-hidden="true">·</span>
            <span>{snapshot.name}</span>
            {snapshot.sourceRevision ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono">{snapshot.sourceRevision}</span>
              </>
            ) : null}
            <span aria-hidden="true">·</span>
            <span>Updated {formatDashboardDate(latest.record.updatedAt)}</span>
            {latest.legacyCount > 0 ? (
              <span className="text-warning">
                {pluralize(latest.legacyCount, "legacy source")} ignored
              </span>
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
            <span className="sr-only">Search entities</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search entities or fields"
              className="min-h-10 w-full rounded-control border bg-canvas px-3 text-xs text-ink placeholder:text-subtle focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={fitDiagram}
            className="min-h-10 rounded-control border bg-canvas px-3 text-xs font-medium text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
          >
            Fit
          </button>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              aria-label="Zoom out"
              onClick={() => setZoom((value) => Math.max(0.55, value - 0.1))}
              className="grid min-h-10 min-w-10 place-items-center rounded-control border bg-canvas text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              −
            </button>
            <span className="min-w-12 text-center font-mono text-micro text-subtle">
              {Math.round(zoom * 100)}%
            </span>
            <button
              type="button"
              aria-label="Zoom in"
              onClick={() => setZoom((value) => Math.min(1.3, value + 0.1))}
              className="grid min-h-10 min-w-10 place-items-center rounded-control border bg-canvas text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div
        className={
          selectedEntity
            ? "min-h-0 flex-1 overflow-y-auto lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:overflow-hidden"
            : "min-h-0 flex-1"
        }
      >
        <div
          ref={canvasRef}
          role="region"
          aria-label={`${snapshot.name} ERD`}
          className="relative h-full min-h-[28rem] overflow-auto bg-canvas lg:min-h-0"
          style={{
            backgroundImage:
              "radial-gradient(circle, var(--color-line) 1px, transparent 1px)",
            backgroundSize: "24px 24px",
          }}
        >
          <div style={{ height: scaledHeight, width: scaledWidth }}>
            <div
              className="relative origin-top-left"
              style={{
                height: layout.height,
                transform: `scale(${zoom})`,
                width: layout.width,
              }}
            >
              <RelationshipLines
                entities={layout.entities}
                relationships={snapshot.relationships}
                selectedEntityId={activeEntityId}
              />
              {layout.entities.map(({ entity, height, width, x, y }) => {
                const matchesQuery =
                  !normalizedQuery ||
                  entity.name.toLocaleLowerCase().includes(normalizedQuery) ||
                  entity.fields.some((field) =>
                    field.name.toLocaleLowerCase().includes(normalizedQuery),
                  );
                const isSelected = entity.id === activeEntityId;
                const isRelated = snapshot.relationships.some(
                  (relationship) =>
                    (relationship.source.entityId === activeEntityId &&
                      relationship.target.entityId === entity.id) ||
                    (relationship.target.entityId === activeEntityId &&
                      relationship.source.entityId === entity.id),
                );
                const isDimmed =
                  !matchesQuery ||
                  Boolean(activeEntityId && !isSelected && !isRelated);
                const positionStyle: CSSProperties = { height, left: x, top: y, width };

                return (
                  <button
                    key={entity.id}
                    ref={(node) => {
                      if (node) entityButtonRefs.current.set(entity.id, node);
                      else entityButtonRefs.current.delete(entity.id);
                    }}
                    type="button"
                    aria-label={`${entity.name} entity, ${pluralize(entity.fields.length, "field")}`}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedEntityId(entity.id)}
                    className={`absolute overflow-hidden rounded-card border bg-surface text-left shadow-card transition-[opacity,border-color,box-shadow] focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none motion-reduce:transition-none ${
                      isSelected
                        ? "border-violet ring-1 ring-violet"
                        : "hover:border-violet/60"
                    } ${isDimmed ? "opacity-30" : "opacity-100"}`}
                    style={positionStyle}
                  >
                    <span className="flex h-[4.125rem] items-center justify-between gap-3 border-b bg-violet-soft px-4">
                      <span className="min-w-0">
                        {entity.domain ? (
                          <span className="block truncate font-mono text-[0.625rem] font-semibold uppercase tracking-[0.1em] text-violet">
                            {entity.domain}
                          </span>
                        ) : null}
                        <span className="mt-0.5 block truncate text-sm font-semibold text-ink">
                          {entity.name}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-micro text-violet">
                        {entity.fields.length}
                      </span>
                    </span>
                    <span className="block">
                      {entity.fields.map((field) => (
                        <span
                          key={field.name}
                          className="grid h-[1.875rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b px-3 last:border-b-0"
                        >
                          <FieldKey field={field} />
                          <span className="truncate font-mono text-micro text-ink">
                            {field.name}
                          </span>
                          <span className="truncate font-mono text-[0.625rem] text-subtle">
                            {field.type}
                            {field.nullable ? "?" : ""}
                          </span>
                        </span>
                      ))}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div aria-label="Relationship list" className="sr-only">
            {snapshot.relationships.map((relationship) => (
              <span key={relationship.id}>
                {getRelationshipCopy(relationship, entitiesById)}
              </span>
            ))}
          </div>
          <p className="sticky bottom-3 left-3 m-3 inline-flex rounded-control border bg-surface/95 px-3 py-2 font-mono text-micro text-muted shadow-card backdrop-blur-sm">
            Select an entity to highlight its relationships
          </p>
        </div>

        {selectedEntity ? (
          <aside
            aria-label={`${selectedEntity.name} entity details`}
            className="min-h-0 overflow-y-auto border-t bg-sidebar p-5 lg:border-t-0 lg:border-l"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-violet">
                  Entity
                </p>
                <h3 className="mt-1 truncate text-lg font-semibold">
                  {selectedEntity.name}
                </h3>
              </div>
              <button
                type="button"
                aria-label="Close entity details"
                onClick={() => {
                  const trigger = entityButtonRefs.current.get(selectedEntity.id);
                  trigger?.focus();
                  setSelectedEntityId(null);
                }}
                className="grid min-h-10 min-w-10 place-items-center rounded-control text-muted hover:bg-hover hover:text-ink focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
              >
                ×
              </button>
            </div>
            {selectedEntity.description ? (
              <p className="mt-3 text-xs leading-5 text-muted">
                {selectedEntity.description}
              </p>
            ) : null}

            <section aria-labelledby="entity-fields-heading" className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h4 id="entity-fields-heading" className="text-xs font-semibold">
                  Fields
                </h4>
                <span className="font-mono text-micro text-subtle">
                  {selectedEntity.fields.length}
                </span>
              </div>
              <ul className="mt-2 divide-y rounded-control border bg-surface">
                {selectedEntity.fields.map((field) => (
                  <li key={field.name} className="px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs text-ink">{field.name}</span>
                      <FieldKey field={field} />
                    </div>
                    <p className="mt-1 font-mono text-micro text-subtle">
                      {field.type}{field.nullable ? " · nullable" : " · required"}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="entity-relations-heading" className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h4 id="entity-relations-heading" className="text-xs font-semibold">
                  Relationships
                </h4>
                <span className="font-mono text-micro text-subtle">
                  {selectedRelationships.length}
                </span>
              </div>
              {selectedRelationships.length > 0 ? (
                <ul className="mt-2 space-y-2">
                  {selectedRelationships.map((relationship) => (
                    <li
                      key={relationship.id}
                      className="rounded-control border bg-surface px-3 py-2.5 font-mono text-micro text-muted"
                    >
                      {getRelationshipCopy(relationship, entitiesById)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-xs text-muted">No relationships</p>
              )}
            </section>
          </aside>
        ) : null}
      </div>
      {latest.legacyRecords.length > 0 ? (
        <div className="max-h-48 shrink-0 overflow-y-auto border-t px-5 pb-5 sm:px-6 sm:pb-6">
          <LegacyRecords records={latest.legacyRecords} />
        </div>
      ) : null}
    </section>
  );
}

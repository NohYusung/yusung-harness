import { formatDashboardDate } from "@/lib/date";
import {
  getLatestDeploymentArchitecture,
  type DeploymentArchitecture,
  type DeploymentNode,
} from "@/lib/deployment-architecture";
import type { Architecture } from "@/types/dashboard";

/** Architecture workspace가 소비하는 프로젝트 단위 배포 record 목록. */
interface ArchitectureWorkspaceProps {
  architectures: Architecture[];
}

/** 배포 환경 metadata와 그 안에서 실행되는 node 묶음. */
interface EnvironmentGroup {
  id: string;
  kind: string;
  meta: string | null;
  name: string;
  nodes: DeploymentNode[];
}

/** 배포 node를 환경별 column으로 묶고 환경 미지정 node를 별도 group에 둔다. */
function groupNodesByEnvironment(
  snapshot: DeploymentArchitecture,
): EnvironmentGroup[] {
  const groups: EnvironmentGroup[] = snapshot.environments.map(
    (environment) => ({
      id: environment.id,
      kind: environment.kind,
      meta:
        [environment.provider, environment.region].filter(Boolean).join(" · ") ||
        null,
      name: environment.name,
      nodes: snapshot.nodes.filter(
        (node) => node.environmentId === environment.id,
      ),
    }),
  );
  const unassignedNodes = snapshot.nodes.filter(
    (node) => node.environmentId === undefined,
  );

  if (unassignedNodes.length > 0) {
    groups.push({
      id: "unassigned",
      kind: "shared",
      meta: null,
      name: "Shared / external",
      nodes: unassignedNodes,
    });
  }

  return groups;
}

/** legacy Architecture 원문을 손실 없이 접어서 보여준다. */
function LegacyRecords({ records }: { records: Architecture[] }) {
  if (records.length === 0) return null;

  return (
    <section aria-labelledby="legacy-architecture-heading" className="mt-6 border-t pt-5">
      <div className="flex items-center justify-between gap-3">
        <h3 id="legacy-architecture-heading" className="text-sm font-semibold text-ink">
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

/** deployment snapshot 부재와 legacy-only 상태를 구분해 안내한다. */
function EmptyArchitecture({ architectures }: ArchitectureWorkspaceProps) {
  if (architectures.length > 0) {
    return (
      <section
        role="alert"
        className="min-h-0 flex-1 overflow-y-auto bg-warning-soft p-6 sm:p-8"
      >
        <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-warning">
          Legacy deployment records
        </p>
        <h2 className="mt-3 text-xl font-semibold">
          Deployment graph unavailable
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          These Architecture records use the legacy text format. Save a
          deployment-architecture snapshot to render the deployment graph.
        </p>
        <LegacyRecords records={architectures} />
      </section>
    );
  }

  return (
    <section className="grid min-h-0 flex-1 place-items-center overflow-y-auto bg-surface px-6 text-center">
      <div className="grid min-h-[28rem] max-w-md place-content-center py-12">
        <span aria-hidden="true" className="font-mono text-3xl text-violet">
          ◇
        </span>
        <h2 className="mt-4 text-xl font-semibold">
          No deployment architecture yet
        </h2>
        <p className="mt-2 text-sm leading-6 text-muted">
          The deployment graph appears after environments, runtime nodes, and
          their connections are saved by the architect agent.
        </p>
      </div>
    </section>
  );
}

/** 배포 환경별 node와 directed connection을 독립 Architecture workspace로 렌더한다. */
export function ArchitectureWorkspace({
  architectures,
}: ArchitectureWorkspaceProps) {
  /** PLAN 문서가 deployment parser나 legacy Current fallback에 섞이지 않게 차단한다. */
  const productionArchitectures = architectures.filter(
    (architecture) => architecture.type === "PRODUCTION",
  );
  const latest = getLatestDeploymentArchitecture(productionArchitectures);

  if (!latest) {
    return <EmptyArchitecture architectures={productionArchitectures} />;
  }

  const { snapshot } = latest;
  const groups = groupNodesByEnvironment(snapshot);
  const nodesById = new Map(snapshot.nodes.map((node) => [node.id, node]));

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-surface">
      <div className="shrink-0 border-b px-5 py-5 sm:px-6">
        <p className="font-mono text-micro font-semibold uppercase tracking-[0.14em] text-violet">
          Architecture
        </p>
        <h2 className="mt-1 text-xl font-semibold">Deployment architecture</h2>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>{snapshot.nodes.length} nodes</span>
          <span aria-hidden="true">·</span>
          <span>{snapshot.connections.length} connections</span>
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
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto bg-canvas">
        <div
          aria-label={`${snapshot.name} deployment architecture`}
          className="p-5 sm:p-6"
          role="region"
        >
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {groups.map((group) => (
            <section key={group.id} className="rounded-card border bg-surface p-4">
              <div className="flex items-start justify-between gap-3 border-b pb-3">
                <div className="min-w-0">
                  <p className="font-mono text-micro font-semibold uppercase tracking-[0.12em] text-violet">
                    {group.kind}
                  </p>
                  <h3 className="mt-1 truncate text-sm font-semibold text-ink">
                    {group.name}
                  </h3>
                </div>
                <span className="font-mono text-micro text-subtle">
                  {group.nodes.length}
                </span>
              </div>
              {group.meta ? (
                <p className="mt-3 font-mono text-micro text-subtle">{group.meta}</p>
              ) : null}
              {group.nodes.length > 0 ? (
                <ul className="mt-3 space-y-2">
                  {group.nodes.map((node) => (
                    <li key={node.id} className="rounded-control bg-surface-muted px-3 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-xs font-semibold text-ink">{node.name}</p>
                        <span className="rounded bg-violet-soft px-1.5 py-0.5 font-mono text-[0.625rem] font-semibold text-violet">
                          {node.kind}
                        </span>
                      </div>
                      {[node.runtime, node.provider, node.region].some(Boolean) ? (
                        <p className="mt-1 font-mono text-micro text-subtle">
                          {[node.runtime, node.provider, node.region]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                      {node.description ? (
                        <p className="mt-2 text-xs leading-5 text-muted">
                          {node.description}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-muted">No nodes</p>
              )}
            </section>
          ))}
        </div>

        <section aria-labelledby="deployment-connections-heading" className="mt-5 rounded-card border bg-surface p-4">
          <div className="flex items-center justify-between gap-3">
            <h3 id="deployment-connections-heading" className="text-sm font-semibold text-ink">
              Connections
            </h3>
            <span className="font-mono text-micro text-subtle">
              {snapshot.connections.length}
            </span>
          </div>
          {snapshot.connections.length > 0 ? (
            <ul className="mt-3 grid gap-2 md:grid-cols-2">
              {snapshot.connections.map((connection) => (
                <li key={connection.id} className="rounded-control bg-surface-muted px-3 py-3 text-xs text-muted">
                  <p className="font-medium text-ink">
                    {nodesById.get(connection.sourceNodeId)?.name ?? connection.sourceNodeId}
                    <span aria-hidden="true" className="mx-2 text-violet">→</span>
                    {nodesById.get(connection.targetNodeId)?.name ?? connection.targetNodeId}
                  </p>
                  {connection.label || connection.protocol ? (
                    <p className="mt-1 font-mono text-micro text-subtle">
                      {[connection.label, connection.protocol]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-muted">No connections</p>
          )}
        </section>
        </div>

        {latest.legacyRecords.length > 0 ? (
          <div className="border-t px-5 pb-5 sm:px-6 sm:pb-6">
            <LegacyRecords records={latest.legacyRecords} />
          </div>
        ) : null}
      </div>
    </section>
  );
}

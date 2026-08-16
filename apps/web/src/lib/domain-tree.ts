import type { Domain } from "@/types/dashboard";

export type DomainHierarchyIssue =
  | "missing-parent"
  | "cross-project-parent"
  | "cycle";

export interface DomainTreeNode {
  domain: Domain;
  parentId: number | null;
  childIds: number[];
  hierarchyIssue: DomainHierarchyIssue | null;
}

export interface DomainTree {
  nodes: Map<number, DomainTreeNode>;
  rootIds: number[];
}

export interface DomainTreeRow extends DomainTreeNode {
  depth: number;
  positionInSet: number;
  setSize: number;
}

/**
 * Flat Domain 목록을 안전한 adjacency tree로 정규화한다.
 *
 * 잘못된 부모와 cycle 노드는 fallback root로 승격하므로 이후 모든 순회는
 * 재귀 없이 각 Domain을 최대 한 번만 방문한다.
 */
export function buildDomainTree(domains: Domain[]): DomainTree {
  const nodes = new Map<number, DomainTreeNode>();

  for (const domain of domains) {
    if (nodes.has(domain.id)) {
      continue;
    }

    nodes.set(domain.id, {
      domain,
      parentId: domain.parentId,
      childIds: [],
      hierarchyIssue: null,
    });
  }

  for (const node of nodes.values()) {
    const parentId = node.parentId;
    if (parentId === null) {
      continue;
    }

    const parent = nodes.get(parentId);
    if (!parent) {
      node.parentId = null;
      node.hierarchyIssue = "missing-parent";
      continue;
    }

    if (parent.domain.projectId !== node.domain.projectId) {
      node.parentId = null;
      node.hierarchyIssue = "cross-project-parent";
      continue;
    }

    if (parentId === node.domain.id) {
      node.parentId = null;
      node.hierarchyIssue = "cycle";
    }
  }

  const resolved = new Set<number>();
  for (const startNode of nodes.values()) {
    if (resolved.has(startNode.domain.id)) {
      continue;
    }

    const path: number[] = [];
    const pathIndex = new Map<number, number>();
    let currentId: number | null = startNode.domain.id;

    while (currentId !== null && !resolved.has(currentId)) {
      const cycleStart = pathIndex.get(currentId);
      if (cycleStart !== undefined) {
        for (let index = cycleStart; index < path.length; index += 1) {
          const cycleId = path[index];
          if (cycleId === undefined) {
            continue;
          }

          const cycleNode = nodes.get(cycleId);
          if (!cycleNode) {
            continue;
          }

          cycleNode.parentId = null;
          cycleNode.hierarchyIssue = "cycle";
        }
        break;
      }

      pathIndex.set(currentId, path.length);
      path.push(currentId);
      currentId = nodes.get(currentId)?.parentId ?? null;
    }

    for (const id of path) {
      resolved.add(id);
    }
  }

  const rootIds: number[] = [];
  for (const node of nodes.values()) {
    if (node.parentId === null) {
      rootIds.push(node.domain.id);
      continue;
    }

    nodes.get(node.parentId)?.childIds.push(node.domain.id);
  }

  rootIds.sort((left, right) => left - right);
  for (const node of nodes.values()) {
    node.childIds.sort((left, right) => left - right);
  }

  return { nodes, rootIds };
}

/** 펼쳐진 노드만 DFS pre-order로 평탄화한다. */
export function flattenDomainTree(
  tree: DomainTree,
  expandedIds: ReadonlySet<number>,
  includedIds?: ReadonlySet<number>,
): DomainTreeRow[] {
  const rows: DomainTreeRow[] = [];
  const visited = new Set<number>();
  const visibleRootIds = includedIds
    ? tree.rootIds.filter((id) => includedIds.has(id))
    : tree.rootIds;
  const stack = visibleRootIds
    .map((id, index) => ({
      id,
      depth: 0,
      positionInSet: index + 1,
      setSize: visibleRootIds.length,
    }))
    .reverse();

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || visited.has(current.id)) {
      continue;
    }

    visited.add(current.id);
    const node = tree.nodes.get(current.id);
    if (!node) {
      continue;
    }

    if (!includedIds || includedIds.has(current.id)) {
      rows.push({
        ...node,
        depth: current.depth,
        positionInSet: current.positionInSet,
        setSize: current.setSize,
      });
    }

    if (!expandedIds.has(current.id)) {
      continue;
    }

    const visibleChildIds = includedIds
      ? node.childIds.filter((id) => includedIds.has(id))
      : node.childIds;
    for (let index = visibleChildIds.length - 1; index >= 0; index -= 1) {
      const childId = visibleChildIds[index];
      if (childId === undefined) {
        continue;
      }

      stack.push({
        id: childId,
        depth: current.depth + 1,
        positionInSet: index + 1,
        setSize: visibleChildIds.length,
      });
    }
  }

  return rows;
}

/** 선택 Domain의 root부터 parent까지 ancestor ID를 반환한다. */
export function getDomainAncestorIds(
  tree: DomainTree,
  domainId: number,
): number[] {
  const ancestors: number[] = [];
  const visited = new Set<number>([domainId]);
  let parentId = tree.nodes.get(domainId)?.parentId ?? null;

  while (parentId !== null && !visited.has(parentId)) {
    visited.add(parentId);
    ancestors.push(parentId);
    parentId = tree.nodes.get(parentId)?.parentId ?? null;
  }

  return ancestors.reverse();
}

/** 검색에 일치한 Domain과 그 조상만 반환한다. */
export function getDomainSearchIds(
  tree: DomainTree,
  query: string,
): Set<number> {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return new Set(tree.nodes.keys());
  }

  const includedIds = new Set<number>();
  for (const node of tree.nodes.values()) {
    const matches =
      node.domain.title.toLocaleLowerCase().includes(normalizedQuery) ||
      node.domain.content.toLocaleLowerCase().includes(normalizedQuery) ||
      String(node.domain.id).includes(normalizedQuery);

    if (!matches) {
      continue;
    }

    includedIds.add(node.domain.id);
    for (const ancestorId of getDomainAncestorIds(tree, node.domain.id)) {
      includedIds.add(ancestorId);
    }
  }

  return includedIds;
}

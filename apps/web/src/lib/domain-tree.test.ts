import { describe, expect, it } from "vitest";
import {
  buildDomainTree,
  flattenDomainTree,
  getDomainAncestorIds,
  getDomainSearchIds,
} from "@/lib/domain-tree";
import { createDomain } from "@/test/fixtures/dashboard";

describe("domain tree", () => {
  it("sorts siblings by id and flattens an arbitrarily deep expanded tree", () => {
    const tree = buildDomainTree([
      createDomain({ id: 4, parentId: 2, title: "Leaf" }),
      createDomain({ id: 3, parentId: 1, title: "Later child" }),
      createDomain({ id: 1, title: "Root" }),
      createDomain({ id: 2, parentId: 1, title: "Earlier child" }),
    ]);

    expect(
      flattenDomainTree(tree, new Set([1, 2])).map(({ domain, depth }) => [
        domain.id,
        depth,
      ]),
    ).toEqual([
      [1, 0],
      [2, 1],
      [4, 2],
      [3, 1],
    ]);
    expect(
      flattenDomainTree(tree, new Set([1, 2])).map(
        ({ domain, positionInSet, setSize }) => [
          domain.id,
          positionInSet,
          setSize,
        ],
      ),
    ).toEqual([
      [1, 1, 1],
      [2, 1, 2],
      [4, 1, 1],
      [3, 2, 2],
    ]);
    expect(getDomainAncestorIds(tree, 4)).toEqual([1, 2]);
  });

  it("promotes orphan, cross-project, self, and cyclic nodes to one fallback root", () => {
    const tree = buildDomainTree([
      createDomain({ id: 1, parentId: 99 }),
      createDomain({ id: 2, projectId: 1, parentId: 3 }),
      createDomain({ id: 3, projectId: 2 }),
      createDomain({ id: 4, parentId: 4 }),
      createDomain({ id: 5, parentId: 6 }),
      createDomain({ id: 6, parentId: 5 }),
    ]);

    const rows = flattenDomainTree(tree, new Set(tree.nodes.keys()));
    expect(rows.map(({ domain }) => domain.id)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(rows.map(({ hierarchyIssue }) => hierarchyIssue)).toEqual([
      "missing-parent",
      "cross-project-parent",
      null,
      "cycle",
      "cycle",
      "cycle",
    ]);
  });

  it("keeps search matches and their ancestors based on title, body, or id", () => {
    const tree = buildDomainTree([
      createDomain({ id: 10, title: "Commerce" }),
      createDomain({ id: 20, parentId: 10, title: "Orders" }),
      createDomain({
        id: 30,
        parentId: 20,
        title: "Fulfillment",
        content: "Shipment policy",
      }),
      createDomain({ id: 40, title: "Identity" }),
    ]);

    expect([...getDomainSearchIds(tree, "shipment")]).toEqual([30, 10, 20]);
    expect([...getDomainSearchIds(tree, "40")]).toEqual([40]);
  });
});

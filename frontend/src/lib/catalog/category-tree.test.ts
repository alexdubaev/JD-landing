import { describe, expect, it } from "vitest";

import type { Category } from "@/types/catalog";

import {
  buildCategoryTree,
  findCategoryTreeNode,
  getCategoryAncestors,
} from "./category-tree";

function category(
  id: string,
  title: string,
  parentId: string | null = null,
  isIndexable = true,
  sortOrder = 0,
): Category {
  return {
    id,
    title,
    slug: id,
    parentId,
    description: null,
    imageId: null,
    imageAlt: null,
    iconId: null,
    iconAlt: null,
    h1: null,
    seoTitle: null,
    seoDescription: null,
    seoText: null,
    intro: null,
    selectionGuide: [],
    internalLinks: [],
    ogImageId: null,
    isIndexable,
    redirectTarget: null,
    sortOrder,
  } as Category;
}

describe("category tree", () => {
  it("builds sorted roots and nested children while excluding noindex nodes", () => {
    const tree = buildCategoryTree([
      category("child", "Child", "root", true, 2),
      category("hidden", "Hidden", null, false, 0),
      category("root", "Root", null, true, 2),
      category("first", "First", null, true, 1),
    ]);

    expect(tree.map((node) => node.id)).toEqual(["first", "root"]);
    expect(tree[1]?.children.map((node) => node.id)).toEqual(["child"]);
  });

  it("promotes a category with a missing parent to a root", () => {
    const tree = buildCategoryTree([category("orphan", "Orphan", "missing")]);

    expect(tree.map((node) => node.id)).toEqual(["orphan"]);
  });

  it("does not recurse forever on a parent cycle", () => {
    const tree = buildCategoryTree([
      category("a", "A", "b", true, 1),
      category("b", "B", "a", true, 2),
    ]);

    expect(tree.flatMap((node) => [node.id, ...node.children.map((child) => child.id)])).toEqual(
      expect.arrayContaining(["a", "b"]),
    );
    expect(findCategoryTreeNode(tree, "a")).toBeDefined();
    expect(findCategoryTreeNode(tree, "b")).toBeDefined();
  });

  it("returns ordered ancestors and stops on malformed cycles", () => {
    const categories = [
      category("root", "Root"),
      category("middle", "Middle", "root"),
      category("leaf", "Leaf", "middle"),
      category("loop-a", "Loop A", "loop-b"),
      category("loop-b", "Loop B", "loop-a"),
    ];

    expect(getCategoryAncestors(categories, "leaf").map(({ id }) => id)).toEqual([
      "root",
      "middle",
    ]);
    expect(getCategoryAncestors(categories, "loop-a").length).toBeLessThanOrEqual(2);
  });
});

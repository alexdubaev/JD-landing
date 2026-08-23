import type { Category } from "@/types/catalog";

export type CategoryTreeNode = Category & {
  children: CategoryTreeNode[];
};

function compareCategories(left: Category, right: Category): number {
  const orderDifference =
    (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
  return orderDifference || left.title.localeCompare(right.title, "ru");
}

export function buildCategoryTree(
  categories: readonly Category[],
): CategoryTreeNode[] {
  const eligible = categories.filter((category) => category.isIndexable);
  const categoriesById = new Map(eligible.map((category) => [category.id, category]));
  const parentById = new Map<string, string | null>();

  for (const category of eligible) {
    const parentId = category.parentId;
    parentById.set(
      category.id,
      parentId && parentId !== category.id && categoriesById.has(parentId)
        ? parentId
        : null,
    );
  }

  // Break each malformed cycle at its first deterministic member. The
  // remaining parent links still form a complete, finite tree.
  for (const category of eligible) {
    const path: string[] = [];
    let currentId: string | null = category.id;

    while (currentId) {
      const repeatedIndex = path.indexOf(currentId);
      if (repeatedIndex !== -1) {
        const cycleIds = path.slice(repeatedIndex);
        const cycleRoot = cycleIds
          .map((id) => categoriesById.get(id))
          .filter((item): item is Category => Boolean(item))
          .sort(compareCategories)[0];
        if (cycleRoot) parentById.set(cycleRoot.id, null);
        break;
      }

      path.push(currentId);
      currentId = parentById.get(currentId) ?? null;
    }
  }

  const nodesById = new Map<string, CategoryTreeNode>(
    eligible.map(
      (category) =>
        [category.id, { ...category, children: [] }] as [
          string,
          CategoryTreeNode,
        ],
    ),
  );
  const roots: CategoryTreeNode[] = [];

  for (const category of eligible) {
    const node = nodesById.get(category.id);
    if (!node) continue;

    const parentId = parentById.get(category.id);
    const parent = parentId ? nodesById.get(parentId) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const sortNodes = (nodes: CategoryTreeNode[]) => {
    nodes.sort(compareCategories);
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return roots;
}

export function findCategoryTreeNode(
  nodes: readonly CategoryTreeNode[],
  categoryId: string,
): CategoryTreeNode | null {
  for (const node of nodes) {
    if (node.id === categoryId) return node;
    const child = findCategoryTreeNode(node.children, categoryId);
    if (child) return child;
  }
  return null;
}

export function getCategoryAncestors(
  categories: readonly Category[],
  categoryId: string,
): Category[] {
  const categoriesById = new Map(categories.map((category) => [category.id, category]));
  const ancestors: Category[] = [];
  const visited = new Set<string>([categoryId]);
  let parentId = categoriesById.get(categoryId)?.parentId ?? null;

  while (parentId && !visited.has(parentId)) {
    const parent = categoriesById.get(parentId);
    if (!parent) break;
    ancestors.unshift(parent);
    visited.add(parent.id);
    parentId = parent.parentId;
  }

  return ancestors;
}

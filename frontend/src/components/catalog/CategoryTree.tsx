import Link from "next/link";

import type { CategoryTreeNode } from "@/lib/catalog/category-tree";

function CategoryTreeList({
  nodes,
  nested = false,
}: {
  nodes: readonly CategoryTreeNode[];
  nested?: boolean;
}) {
  return (
    <ul
      className={
        nested
          ? "category-tree__list category-tree__list--nested"
          : "category-tree__list category-tree__list--root"
      }
    >
      {nodes.map((node) => (
        <li
          className={`category-tree__item${node.children.length ? " category-tree__item--branch" : ""}`}
          key={node.id}
        >
          <Link
            className={`category-tree__link ${node.children.length ? "category-tree__link--parent" : "category-tree__link--category"}`}
            href={`/catalog/${node.slug}`}
          >
            {node.title}
            <span className="category-tree__arrow" aria-hidden="true">
              →
            </span>
          </Link>
          {node.children.length ? (
            <CategoryTreeList nested nodes={node.children} />
          ) : null}
        </li>
      ))}
    </ul>
  );
}

export function CategoryTree({
  nodes,
  title = "Категории каталога",
}: {
  nodes: readonly CategoryTreeNode[];
  title?: string;
}) {
  if (!nodes.length) return null;

  return (
    <section className="category-tree" aria-labelledby="category-tree-heading">
      <h2 id="category-tree-heading">{title}</h2>
      <nav aria-label={title}>
        <CategoryTreeList nodes={nodes} />
      </nav>
    </section>
  );
}

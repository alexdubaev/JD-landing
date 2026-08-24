import Link from "next/link";

import type { CategorySeoCopy } from "@/lib/seo/category-content";

export function CategorySeoContent({
  seoText,
  content,
}: {
  seoText?: string | null;
  content?: Pick<CategorySeoCopy, "intro" | "selectionPoints" | "links"> | null;
}) {
  const paragraphs = seoText
    ?.split(/\n\s*\n/u)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (paragraphs?.length) {
    return (
      <section className="catalog-seo-content" aria-labelledby="category-seo">
        <h2 id="category-seo">О категории</h2>
        {paragraphs.map((paragraph, index) => (
          <p key={`${index}-${paragraph}`}>{paragraph}</p>
        ))}
      </section>
    );
  }

  if (!content) return null;

  return (
    <section className="catalog-seo-content" aria-labelledby="category-selection">
      <h2 id="category-selection">Как подобрать запчасть</h2>
      <p>{content.intro}</p>
      <ul>
        {content.selectionPoints.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </ul>
      <nav aria-label="Полезные материалы категории">
        {content.links.map((link) => (
          <Link href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>
    </section>
  );
}

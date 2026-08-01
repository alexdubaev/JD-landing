import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { directusAssetUrl } from "@/lib/directus/assets";
import type { ArticleCardData } from "@/types/catalog";

const dateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export function ArticleCard({ article }: { article: ArticleCardData }) {
  const cover = directusAssetUrl(article.coverImageId, {
    width: 960,
    height: 600,
    fit: "cover",
    quality: 84,
    format: "webp",
  });

  return (
    <article className="article-card">
      <Link className="article-card__media" href={`/articles/${article.slug}`}>
        {cover ? (
          <Image
            alt={article.imageAlt || article.title}
            fill
            sizes="(max-width: 48rem) 100vw, 33vw"
            src={cover}
          />
        ) : (
          <span aria-hidden="true" className="article-card__placeholder">
            DS / GUIDE
          </span>
        )}
      </Link>
      <div className="article-card__body">
        <div className="article-card__meta">
          {article.categoryLabel ? <span>{article.categoryLabel}</span> : null}
          <time dateTime={article.publishedAt}>
            {dateFormatter.format(new Date(article.publishedAt))}
          </time>
          {article.readingTimeMinutes ? (
            <span>{article.readingTimeMinutes} мин чтения</span>
          ) : null}
        </div>
        <h3>
          <Link href={`/articles/${article.slug}`}>{article.title}</Link>
        </h3>
        <p>{article.excerpt}</p>
        <Link className="article-card__link" href={`/articles/${article.slug}`}>
          Читать
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

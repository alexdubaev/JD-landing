import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";

import { ArticleCard } from "@/components/articles/ArticleCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { JsonLdSchema } from "@/components/seo/JsonLdSchema";
import { Container } from "@/components/ui/Container";
import { sanitizeArticleHtml } from "@/lib/articles/sanitize";
import { directusAssetUrl } from "@/lib/directus/assets";
import {
  getArticleBySlug,
  getRelatedArticles,
} from "@/lib/directus/articles";
import { getSiteSettings } from "@/lib/directus/content";
import { absoluteUrl } from "@/lib/seo/url";
import { buildBreadcrumbSchema, buildOrganizationSchema } from "@/lib/seo/schema";

const formatDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) return {};
  const canonical = `/articles/${article.slug}`;
  const image = directusAssetUrl(article.ogImageId ?? article.coverImageId, {
    width: 1200,
    height: 630,
    fit: "cover",
    format: "webp",
  });
  return {
    title: article.seoTitle ?? article.title,
    description: article.seoDescription ?? article.excerpt,
    alternates: { canonical },
    openGraph: {
      title: article.seoTitle ?? article.title,
      description: article.seoDescription ?? article.excerpt,
      type: "article",
      url: absoluteUrl(canonical),
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt ?? undefined,
      images: image ? [{ url: image, alt: article.imageAlt ?? article.title }] : [],
    },
  };
}

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();
  const related = await getRelatedArticles(article.id);
  const cover = directusAssetUrl(article.coverImageId, {
    width: 1440,
    height: 900,
    fit: "cover",
    quality: 86,
    format: "webp",
  });
  const canonical = `/articles/${article.slug}`;
  const coverUrl = directusAssetUrl(article.coverImageId, {
    width: 1200,
    height: 630,
    fit: "cover",
    format: "webp",
  });

  const breadcrumbItems = [
    { name: "Главная", url: absoluteUrl("/") },
    { name: "Статьи", url: absoluteUrl("/articles") },
    { name: article.title, url: absoluteUrl(canonical) },
  ];

  const settings = await getSiteSettings().catch(() => null);
  const organizationSchema = settings
    ? buildOrganizationSchema(settings)
    : null;

  return (
    <main className="article-page" id="main-content">
      {organizationSchema ? <JsonLdSchema data={organizationSchema} /> : null}
      <JsonLdSchema
        data={{
          "@context": "https://schema.org",
          "@type": "Article",
          headline: article.title,
          description: article.excerpt,
          datePublished: article.publishedAt,
          dateModified: article.updatedAt ?? article.publishedAt,
          image: coverUrl ? [coverUrl] : undefined,
          mainEntityOfPage: absoluteUrl(canonical),
          publisher: { "@id": `${absoluteUrl("/")}#organization` },
        }}
      />
      <JsonLdSchema data={buildBreadcrumbSchema(breadcrumbItems)} />
      <Container>
        <Breadcrumbs
          items={[
            { label: "Главная", href: "/" },
            { label: "Статьи", href: "/articles" },
            { label: article.title },
          ]}
        />
        <article className="article-detail">
          <header>
            <time dateTime={article.publishedAt}>
              {formatDate.format(new Date(article.publishedAt))}
            </time>
            <h1>{article.title}</h1>
            <p>{article.excerpt}</p>
          </header>
          {cover ? (
            <div className="article-detail__cover">
              <Image
                alt={article.imageAlt || article.title}
                fill
                priority
                sizes="(max-width: 60rem) 100vw, 1100px"
                src={cover}
              />
            </div>
          ) : null}
          <div
            className="article-content"
            dangerouslySetInnerHTML={{
              __html: sanitizeArticleHtml(article.content),
            }}
          />
        </article>
        {related.length ? (
          <section className="related-articles">
            <h2>Читайте также</h2>
            <div className="article-grid">
              {related.map((item) => (
                <ArticleCard article={item} key={item.id} />
              ))}
            </div>
          </section>
        ) : null}
      </Container>
    </main>
  );
}
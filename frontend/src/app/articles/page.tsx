import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ArticleCard } from "@/components/articles/ArticleCard";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Pagination } from "@/components/catalog/Pagination";
import { Container } from "@/components/ui/Container";
import { getArticlesPage } from "@/lib/directus/articles";
import { absoluteUrl } from "@/lib/seo/url";

export const metadata: Metadata = {
  title: "Статьи о подборе комплектующих John Deere",
  description:
    "Практические материалы о подготовке данных, поиске артикула и проверке комплектующих перед заказом.",
  alternates: { canonical: "/articles" },
  openGraph: {
    title: "Статьи о подборе комплектующих John Deere",
    description:
      "Практические материалы для подготовки запроса и проверки исходных данных.",
    type: "website",
    url: absoluteUrl("/articles"),
  },
};

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const parsedPage = Number(params.page ?? "1");
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const result = await getArticlesPage(page);

  // 404 for out-of-range page numbers
  if (page > 1 && page > result.totalPages) notFound();

  return (
    <main className="articles-page" id="main-content">
      <Container>
        <Breadcrumbs
          items={[{ label: "Главная", href: "/" }, { label: "Статьи" }]}
        />
        <header className="page-heading page-heading--compact">
          <p>База знаний</p>
          <h1>Статьи о подборе комплектующих</h1>
          <p>
            Короткие инструкции, которые помогают подготовить точный запрос и
            сократить количество уточнений.
          </p>
        </header>
        <div className="article-grid article-grid--listing">
          {result.items.map((article) => (
            <ArticleCard article={article} key={article.id} />
          ))}
        </div>
        <Pagination
          currentPage={result.page}
          pageSize={result.pageSize}
          pathname="/articles"
          searchParams={params}
          total={result.total}
        />
      </Container>
    </main>
  );
}

import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { ArticleCard } from "@/components/articles/ArticleCard";
import { Container } from "@/components/ui/Container";
import type { ArticleCardData } from "@/types/catalog";
import type { PageSection } from "@/types/content";

export function HomeArticles({
  articles,
  section,
}: {
  articles: ArticleCardData[];
  section: PageSection;
}) {
  if (!articles.length) return null;
  return (
    <section className="home-section home-articles">
      <Container>
        <div className="home-section__heading">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Практические статьи"}</h2>
          </div>
          <Link href={section.buttonUrl ?? "/articles"}>
            {section.buttonText ?? "Все статьи"}
            <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="article-grid">
          {articles.slice(0, 3).map((article) => (
            <ArticleCard article={article} key={article.id} />
          ))}
        </div>
      </Container>
    </section>
  );
}

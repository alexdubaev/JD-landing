import { siteOrigin } from "@/lib/seo/url";
import { getFeaturedArticles } from "@/lib/directus/articles";
import { getCategories } from "@/lib/directus/catalog";

export const revalidate = 3600;

/**
 * Static llms.txt endpoint for AI/LLM crawlers.
 * Returns only canonical, public, indexable pages.
 * Content-Type: text/plain
 *
 * This is a supplement to robots.txt and sitemap.xml, not a replacement.
 */
export async function GET() {
  const origin = siteOrigin();
  const [categories, articles] = await Promise.all([
    getCategories().catch(() => []),
    getFeaturedArticles(3).catch(() => []),
  ]);
  const indexableCategories = categories
    .filter((category) => category.isIndexable)
    .slice(0, 10);
  const lines = [
    "# deere-shop.ru",
    "",
    "> Независимый каталог комплектующих John Deere. Поставка запчастей и подбор решений под задачи клиента.",
    "",
    "## Основные страницы",
    "",
    `- [Главная](${origin}/)`,
    `- [Каталог](${origin}/catalog)`,
    `- [Запрос по списку](${origin}/parts-request)`,
    `- [Контакты](${origin}/contacts)`,
    `- [Доставка](${origin}/delivery)`,
    `- [О компании](${origin}/about)`,
    "",
    "## Категории",
    "",
    ...indexableCategories.map(
      (category) => `- [${category.title}](${origin}/catalog/${category.slug})`,
    ),
    "",
    "## Условия подбора",
    "",
    "- Цены, наличие и совместимость подтверждаются перед заказом.",
    "- Для подбора укажите артикул, модель техники, маркировку или приложите фото детали.",
    "",
    "## Статьи",
    "",
    `- [Статьи о подборе комплектующих](${origin}/articles)`,
    ...articles.map(
      (article) => `- [${article.title}](${origin}/articles/${article.slug})`,
    ),
    "",
    "## Политики",
    "",
    `- [Политика конфиденциальности](${origin}/privacy-policy)`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}

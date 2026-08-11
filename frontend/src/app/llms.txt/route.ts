import { siteOrigin } from "@/lib/seo/url";

/**
 * Static llms.txt endpoint for AI/LLM crawlers.
 * Returns only canonical, public, indexable pages.
 * Content-Type: text/plain
 *
 * This is a supplement to robots.txt and sitemap.xml, not a replacement.
 */
export async function GET() {
  const origin = siteOrigin();
  const lines = [
    "# deere-shop.ru",
    "",
    "> Каталог комплектующих John Deere. Поставка запчастей и подбор решений под задачи клиента.",
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
    "## Статьи",
    "",
    `- [Статьи о подборе комплектующих](${origin}/articles)`,
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

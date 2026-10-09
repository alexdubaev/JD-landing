import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Pagination } from "./Pagination";

describe("catalog pagination index", () => {
  it("emits server HTML links to every page and marks the current page", () => {
    const html = renderToStaticMarkup(
      <Pagination
        currentPage={10}
        pageSize={24}
        pathname="/catalog"
        searchParams={{ q: "filter", utm_source: ["mail", "duplicate"] }}
        total={541 * 24}
      />,
    );

    const indexHtml = html.match(/<details class="catalog-pagination__index">([\s\S]*?)<\/details>/)?.[1];
    const links = Array.from(indexHtml?.matchAll(/<a\b([^>]*)>(\d+)<\/a>/g) ?? []);
    expect(indexHtml).toContain("Все страницы");
    expect(links).toHaveLength(541);
    expect(links[0]?.[1]).toContain('href="/catalog?q=filter&amp;utm_source=mail"');
    expect(links[540]?.[1]).toContain('href="/catalog?q=filter&amp;utm_source=mail&amp;page=541"');
    expect(links[9]?.[1]).toContain('aria-current="page"');
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  RelationResolver,
  ResolvedRelation,
} from "@/lib/articles/structured-content";

import { ArticleContent } from "./ArticleContent";

const productResolver: RelationResolver = (ref) => {
  const data: Record<string, ResolvedRelation> = {
    "product:p-1": {
      kind: "product",
      title: "Трактор John Deere 6155M",
      url: "/catalog/tractors/john-deere-6155m",
      priceLabel: "по запросу",
    },
    "category:c-1": {
      kind: "category",
      title: "Тракторы",
      url: "/catalog/tractors",
    },
    "cta:cta-1": {
      kind: "cta",
      label: "Заказать консультацию",
      url: "/contacts",
      variant: "primary",
    },
  };
  return data[`${ref.kind}:${ref.id}`];
};

describe("ArticleContent — rich text rendering", () => {
  it("renders headings H2-H4, paragraphs, bold/italic and links", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Подбор запчастей" }],
        },
        {
          type: "heading",
          attrs: { level: 4 },
          content: [{ type: "text", text: "Шаг 1" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Обычный " },
            { type: "text", text: "жирный", marks: [{ type: "bold" }] },
            { type: "text", text: " и " },
            { type: "text", text: "курсив", marks: [{ type: "italic" }] },
            {
              type: "text",
              text: "ссылка",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    const { container } = render(<ArticleContent contentBlocks={blocks} />);

    expect(container.querySelector("h2")).not.toBeNull();
    expect(container.querySelector("h4")?.textContent).toBe("Шаг 1");
    const link = screen.getByRole("link", { name: "ссылка" });
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(container.querySelector("strong")?.textContent).toBe("жирный");
    expect(container.querySelector("em")?.textContent).toBe("курсив");
  });

  it("renders bullet lists, ordered lists, blockquote and hard break", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "первый пункт" }],
                },
              ],
            },
          ],
        },
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "нумерованный" }],
                },
              ],
            },
          ],
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "цитата" }],
            },
          ],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "строка раз" },
            { type: "hardBreak" },
            { type: "text", text: "строка два" },
          ],
        },
      ],
    };
    const { container } = render(<ArticleContent contentBlocks={blocks} />);

    expect(container.querySelector("ul li")?.textContent).toContain("первый пункт");
    expect(container.querySelector("ol li")?.textContent).toContain("нумерованный");
    expect(container.querySelector("blockquote")?.textContent).toContain("цитата");
    expect(container.querySelector("br")).not.toBeNull();
  });

  it("renders a table with header and body cells", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Параметр" }],
                    },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Значение" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    };
    const { container } = render(<ArticleContent contentBlocks={blocks} />);

    const table = container.querySelector("table");
    expect(table).not.toBeNull();
    expect(table?.querySelector("th")?.textContent).toBe("Параметр");
    expect(table?.querySelector("td")?.textContent).toBe("Значение");
  });
});

describe("ArticleContent — relation nodes via injectable resolver", () => {
  it("renders product, CTA and category relation data supplied by the resolver, not from JSON", () => {
    // The JSON holds ONLY a reference id. Title/price/url come from resolver.
    const blocks = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "intro" }] },
        { type: "productRelation", attrs: { id: "p-1" } },
        { type: "ctaRelation", attrs: { id: "cta-1", label: "Заказать", variant: "primary" } },
        { type: "categoryRelation", attrs: { id: "c-1" } },
      ],
    };
    const resolve = vi.fn(productResolver);
    render(<ArticleContent contentBlocks={blocks} resolveRelation={resolve} />);

    // Resolver was called once per relation with the correct reference. Product
    // and category carry no node presentation, so their context is undefined;
    // only CTA forwards the editor's label/variant.
    const productCall = resolve.mock.calls.find(
      ([ref]) => ref.kind === "product" && ref.id === "p-1",
    );
    const categoryCall = resolve.mock.calls.find(
      ([ref]) => ref.kind === "category" && ref.id === "c-1",
    );
    const ctaCall = resolve.mock.calls.find(
      ([ref]) => ref.kind === "cta" && ref.id === "cta-1",
    );
    expect(productCall).toBeTruthy();
    expect(productCall?.[1]).toBeUndefined();
    expect(categoryCall).toBeTruthy();
    expect(ctaCall?.[1]).toEqual({ nodeLabel: "Заказать", nodeVariant: "primary" });

    // Resolved product title/price/url appear; JSON never contained them.
    const productLink = screen.getByRole("link", { name: /Трактор John Deere 6155M/i });
    expect(productLink).toHaveAttribute("href", "/catalog/tractors/john-deere-6155m");
    expect(screen.getByText("по запросу")).toBeInTheDocument();

    // CTA button.
    const ctaLink = screen.getByRole("link", { name: "Заказать консультацию" });
    expect(ctaLink).toHaveAttribute("href", "/contacts");

    // Category relation.
    const categoryLink = screen.getByRole("link", { name: "Тракторы" });
    expect(categoryLink).toHaveAttribute("href", "/catalog/tractors");
  });

  it("renders nothing executable for an unresolved relation in public mode", () => {
    const blocks = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "текст" }] },
        { type: "productRelation", attrs: { id: "missing" } },
      ],
    };
    const resolve: RelationResolver = () => undefined;
    const { container } = render(
      <ArticleContent contentBlocks={blocks} resolveRelation={resolve} mode="public" />,
    );

    expect(screen.getByText("текст")).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });

  it("shows a safe diagnostic for an unresolved relation in preview mode", () => {
    const blocks = {
      type: "doc",
      content: [{ type: "productRelation", attrs: { id: "missing" } }],
    };
    const resolve: RelationResolver = () => undefined;
    render(
      <ArticleContent contentBlocks={blocks} resolveRelation={resolve} mode="preview" />,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("ArticleContent — security", () => {
  it("drops a link with an unsafe href and renders its text without an anchor", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "опасно",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    const { container } = render(<ArticleContent contentBlocks={blocks} />);

    expect(screen.getByText("опасно")).toBeInTheDocument();
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders nothing executable for a script node in public mode", () => {
    const blocks = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "видимо" }] },
        { type: "script", attrs: { src: "evil.js" } },
      ],
    };
    const { container } = render(<ArticleContent contentBlocks={blocks} mode="public" />);

    expect(screen.getByText("видимо")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).not.toContain("evil.js");
  });

  it("shows a diagnostic for an unknown/script node in preview mode", () => {
    const blocks = {
      type: "doc",
      content: [
        { type: "script", attrs: {} },
        { type: "weirdCustom", attrs: {} },
      ],
    };
    const { container } = render(<ArticleContent contentBlocks={blocks} mode="preview" />);

    const alerts = screen.getAllByRole("alert");
    expect(alerts).toHaveLength(2);
    expect(container.textContent).toContain("script");
    expect(container.textContent).toContain("weirdCustom");
  });

  it("renders a disabled H1 as nothing in public and as a diagnostic in preview", () => {
    const blocks = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Запрещённый H1" }],
        },
      ],
    };
    const { container: publicContainer } = render(
      <ArticleContent contentBlocks={blocks} mode="public" />,
    );
    expect(publicContainer.querySelector("h1")).toBeNull();
    expect(publicContainer.textContent).not.toContain("Запрещённый H1");

    const { container: previewContainer } = render(
      <ArticleContent contentBlocks={blocks} mode="preview" />,
    );
    expect(previewContainer.querySelector("h1")).toBeNull();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });
});

describe("ArticleContent — HTML fallback", () => {
  it("falls back to sanitized HTML when content_blocks is absent", () => {
    const html =
      '<h2>Заголовок</h2><p>Текст <strong>важный</strong> <a href="https://example.com">ссылка</a></p>' +
      "<script>alert(1)</script>";
    const { container } = render(
      <ArticleContent contentBlocks={null} htmlFallback={html} />,
    );

    expect(container.querySelector("h2")?.textContent).toBe("Заголовок");
    expect(container.querySelector("strong")?.textContent).toBe("важный");
    const link = screen.getByRole("link", { name: "ссылка" });
    expect(link).toHaveAttribute("href", "https://example.com");
    // Script stripped by the sanitizer.
    expect(container.querySelector("script")).toBeNull();
  });

  it("falls back to sanitized HTML when content_blocks is invalid JSON shape", () => {
    const { container } = render(
      <ArticleContent
        contentBlocks="not-json"
        htmlFallback="<p>запасной текст</p>"
      />,
    );
    expect(container.querySelector("p")?.textContent).toBe("запасной текст");
  });

  it("renders nothing when neither content_blocks nor a fallback is available", () => {
    const { container } = render(<ArticleContent contentBlocks={null} />);
    expect(container.textContent).toBe("");
  });

  it("does not call the resolver on the HTML fallback path", () => {
    const resolve = vi.fn();
    render(
      <ArticleContent
        contentBlocks={undefined}
        htmlFallback="<p>текст</p>"
        resolveRelation={resolve}
      />,
    );
    expect(resolve).not.toHaveBeenCalled();
  });
});

describe("ArticleContent — does not perform Directus I/O", () => {
  it("renders a mixed document using only the injected resolver (no fetch)", () => {
    const blocks = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "intro" }] },
        { type: "productRelation", attrs: { id: "p-1" } },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "внешняя",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
        { type: "categoryRelation", attrs: { id: "c-1" } },
      ],
    };
    const resolve = vi.fn(productResolver);
    const { container } = render(
      <ArticleContent contentBlocks={blocks} resolveRelation={resolve} />,
    );

    // Two externalised relations resolved via the resolver only.
    expect(resolve).toHaveBeenCalledTimes(2);
    // Internal links for relations + an inline external link coexist.
    const links = container.querySelectorAll("a");
    expect(links.length).toBeGreaterThanOrEqual(3);
    const external = screen.getByRole("link", { name: "внешняя" });
    expect(external).toHaveAttribute("rel", "nofollow noopener noreferrer");
  });
});

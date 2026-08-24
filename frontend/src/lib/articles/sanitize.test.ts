import { describe, expect, it } from "vitest";

import { sanitizeArticleHtml } from "./sanitize";

describe("sanitizeArticleHtml", () => {
  it("keeps the editorial allowlist and safe links", () => {
    const result = sanitizeArticleHtml(
      '<h2>Заголовок</h2><p>Текст <strong>важный</strong> <a href="https://example.com">ссылка</a></p>',
    );
    expect(result).toContain("<h2>Заголовок</h2>");
    expect(result).toContain("<strong>важный</strong>");
    expect(result).toContain('rel="nofollow noopener noreferrer"');
  });

  it("keeps internal links followable while nofollowing external links", () => {
    const result = sanitizeArticleHtml(
      '<p><a href="/catalog/gidravlika/AH227024">Гидравлический насос</a>, <a href="https://deere-shop.ru/catalog/gidravlika/AH227024">полная внутренняя ссылка</a> и <a href="https://example.com">источник</a></p>',
    );

    expect(result).toContain('<a href="/catalog/gidravlika/AH227024">Гидравлический насос</a>');
    expect(result).toContain('<a href="https://deere-shop.ru/catalog/gidravlika/AH227024">полная внутренняя ссылка</a>');
    expect(result).not.toContain('<a href="/catalog/gidravlika/AH227024" rel=');
    expect(result).not.toContain('<a href="https://deere-shop.ru/catalog/gidravlika/AH227024" rel=');
    expect(result).toContain('<a href="https://example.com" rel="nofollow noopener noreferrer">источник</a>');
  });

  it("removes scripts, styles, iframes, images and event handlers", () => {
    const result = sanitizeArticleHtml(
      '<script>alert(1)</script><style>p{display:none}</style><iframe src="x"></iframe><img src="x"><p onclick="alert(1)">Безопасный текст</p>',
    );
    expect(result).toBe("<p>Безопасный текст</p>");
  });
});

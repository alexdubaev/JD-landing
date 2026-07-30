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

  it("removes scripts, styles, iframes, images and event handlers", () => {
    const result = sanitizeArticleHtml(
      '<script>alert(1)</script><style>p{display:none}</style><iframe src="x"></iframe><img src="x"><p onclick="alert(1)">Безопасный текст</p>',
    );
    expect(result).toBe("<p>Безопасный текст</p>");
  });
});

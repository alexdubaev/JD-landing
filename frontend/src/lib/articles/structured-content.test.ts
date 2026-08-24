import { describe, expect, it } from "vitest";

import {
  extractRelationRefs,
  isSafeUrl,
  parseStructuredContent,
} from "./structured-content";

describe("isSafeUrl", () => {
  it.each([
    ["https://example.com/path", "https"],
    ["http://example.com", "http"],
    ["HTTPS://Example.COM", "uppercase https"],
    ["mailto:info@example.com", "mailto"],
    ["tel:+74951234567", "tel"],
    ["/catalog/tractors", "relative path"],
    ["#section-anchor", "anchor"],
    ["//cdn.example.com/x.png", "protocol-relative"],
    ["article-slug", "bare segment"],
  ])("accepts safe URL %s (%s)", (url) => {
    expect(isSafeUrl(url)).toBe(true);
  });

  it.each([
    ["javascript:alert(1)", "javascript"],
    ["JavaScript:alert(1)", "case-insensitive javascript"],
    ["java\tscript:alert(1)", "tab-obfuscated javascript"],
    ["java\nscript:alert(1)", "newline-obfuscated javascript"],
    ["data:text/html,<script>alert(1)</script>", "data html"],
    ["vbscript:msgbox(1)", "vbscript"],
    ["file:///etc/passwd", "file scheme"],
    ["", "empty string"],
  ])("rejects unsafe URL %s (%s)", (url) => {
    expect(isSafeUrl(url)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isSafeUrl(undefined)).toBe(false);
    expect(isSafeUrl(null)).toBe(false);
    expect(isSafeUrl(42)).toBe(false);
  });
});

describe("parseStructuredContent — fallback triggers", () => {
  it("returns ok:false for null and undefined", () => {
    expect(parseStructuredContent(null)).toEqual({ ok: false, reason: "absent" });
    expect(parseStructuredContent(undefined)).toEqual({ ok: false, reason: "absent" });
  });

  it("returns ok:false for primitives and arrays", () => {
    expect(parseStructuredContent("not json").ok).toBe(false);
    expect(parseStructuredContent(42).ok).toBe(false);
    expect(parseStructuredContent([]).ok).toBe(false);
    expect(parseStructuredContent("  ").ok).toBe(false);
  });

  it("returns ok:false for object without doc type", () => {
    expect(parseStructuredContent({ type: "paragraph" }).ok).toBe(false);
    expect(parseStructuredContent({ foo: "bar" }).ok).toBe(false);
  });

  it("returns ok:false when content is missing or not an array", () => {
    expect(parseStructuredContent({ type: "doc" }).ok).toBe(false);
    expect(parseStructuredContent({ type: "doc", content: {} }).ok).toBe(false);
  });

  it("returns ok:false for an empty document", () => {
    expect(parseStructuredContent({ type: "doc", content: [] })).toEqual({
      ok: false,
      reason: "empty-content",
    });
  });
});

describe("parseStructuredContent — allowlist validation", () => {
  it("parses a rich-text-only document and extracts no relation refs", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Заголовок" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Просто текст" }],
        },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.content).toHaveLength(2);
      expect(extractRelationRefs(result.document)).toEqual([]);
    }
  });

  it("parses the full supported sequence and extracts relations in order", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "intro" }] },
        { type: "productRelation", attrs: { id: "p-1" } },
        { type: "paragraph", content: [{ type: "text", text: "between" }] },
        {
          type: "ctaRelation",
          attrs: { id: "cta-1", label: "Заказать", variant: "primary" },
        },
        { type: "categoryRelation", attrs: { id: "c-1" } },
        {
          type: "table",
          content: [
            {
              type: "tableRow",
              content: [
                {
                  type: "tableHeader",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Параметр" }] },
                  ],
                },
                {
                  type: "tableCell",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text: "Значение" }] },
                  ],
                },
              ],
            },
          ],
        },
        { type: "paragraph", content: [{ type: "text", text: "outro" }] },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(extractRelationRefs(result.document)).toEqual([
        { kind: "product", id: "p-1" },
        { kind: "cta", id: "cta-1" },
        { kind: "category", id: "c-1" },
      ]);
    }
  });

  it("rejects H1 (level 1) by converting the heading into an unknown node", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Должен быть отключён" }],
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Допустимый H3" }],
        },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.content[0]).toEqual({
        type: "unknown",
        originalType: "heading",
      });
      expect(result.document.content[1]).toMatchObject({ type: "heading", attrs: { level: 3 } });
    }
  });

  it("converts a script node into an unknown node (no raw execution surface)", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "ok" }] },
        { type: "script", attrs: { src: "evil.js" } },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.content[1]).toEqual({
        type: "unknown",
        originalType: "script",
      });
    }
  });

  it("converts a corrupted node (wrong shape) into an unknown node", () => {
    const doc = {
      type: "doc",
      content: [
        "not-an-object",
        { type: "paragraph", content: [{ type: "text", text: "ok" }] },
        { type: "customBlock", attrs: { danger: true } },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.document.content[0]).toEqual({ type: "unknown", originalType: null });
      expect(result.document.content[2]).toEqual({
        type: "unknown",
        originalType: "customBlock",
      });
    }
  });

  it("converts a relation node without a valid id into an unknown node", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "productRelation", attrs: {} },
        { type: "categoryRelation", attrs: { id: "  " } },
        { type: "productRelation" },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      for (const node of result.document.content) {
        expect(node.type).toBe("unknown");
      }
      expect(extractRelationRefs(result.document)).toEqual([]);
    }
  });
});

describe("parseStructuredContent — inline marks and link safety", () => {
  it("keeps bold and italic marks and safe link marks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "жирный", marks: [{ type: "bold" }] },
            { type: "text", text: " " },
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
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const para = result.document.content[0];
      if (para.type !== "paragraph") throw new Error("expected paragraph");
      const marks = para.content?.flatMap((n) => n.type === "text" ? (n.marks ?? []) : []);
      expect(marks).toEqual([
        { type: "bold" },
        { type: "italic" },
        { type: "link", attrs: { href: "https://example.com" } },
      ]);
    }
  });

  it("drops a link mark with an unsafe href but keeps the text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "опасная ссылка",
              marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
            },
          ],
        },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const para = result.document.content[0];
      if (para.type !== "paragraph") throw new Error("expected paragraph");
      const textNode = para.content?.[0];
      if (textNode?.type !== "text") throw new Error("expected text");
      expect(textNode.text).toBe("опасная ссылка");
      expect(textNode.marks).toBeUndefined();
    }
  });

  it("drops unknown marks (e.g. event-handler-style) and keeps text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "x",
              marks: [{ type: "onmouseover", attrs: { onclick: "alert(1)" } }],
            },
          ],
        },
      ],
    };
    const result = parseStructuredContent(doc);
    expect(result.ok).toBe(true);
    if (result.ok) {
      const para = result.document.content[0];
      if (para.type !== "paragraph") throw new Error("expected paragraph");
      const textNode = para.content?.[0];
      if (textNode?.type !== "text") throw new Error("expected text");
      expect(textNode.text).toBe("x");
      expect(textNode.marks).toBeUndefined();
    }
  });
});

describe("extractRelationRefs", () => {
  it("deduplicates repeated relation references, keeping first order", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "productRelation", attrs: { id: "p-1" } },
        { type: "productRelation", attrs: { id: "p-1" } },
        { type: "categoryRelation", attrs: { id: "c-1" } },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "ctaRelation",
                  attrs: { id: "cta-1" },
                },
              ],
            },
          ],
        },
      ],
    };
    const result = parseStructuredContent(doc);
    if (!result.ok) throw new Error("expected ok");
    expect(extractRelationRefs(result.document)).toEqual([
      { kind: "product", id: "p-1" },
      { kind: "category", id: "c-1" },
      { kind: "cta", id: "cta-1" },
    ]);
  });
});

import { describe, expect, it } from "vitest";

import { renderLeadEmail } from "./render";

const identity = (value: string) => value;

describe("renderLeadEmail", () => {
  it("includes core contact details", () => {
    const html = renderLeadEmail({
      name: "Иван",
      phone: "+7 900 000-00-00",
      email: "ivan@example.test",
      escape: identity,
    });

    expect(html).toContain("Иван");
    expect(html).toContain("+7 900 000-00-00");
    expect(html).toContain("ivan@example.test");
    expect(html).toContain("Новая заявка");
  });

  it("omits empty optional fields", () => {
    const html = renderLeadEmail({
      name: "Иван",
      phone: "+7 900 000-00-00",
      escape: identity,
    });

    expect(html).not.toContain("Продукт");
    expect(html).not.toContain("Категория");
    expect(html).not.toContain("Список запчастей");
  });

  it("renders request items as a list", () => {
    const html = renderLeadEmail({
      name: "Иван",
      phone: "+7 900 000-00-00",
      requestItems: [
        { article: "RE504836", quantity: 2 },
        { article: "AH132134", quantity: 1 },
      ],
      escape: identity,
    });

    expect(html).toContain("RE504836 — 2 шт.");
    expect(html).toContain("AH132134 — 1 шт.");
  });

  it("renders attachment count and UTM when present", () => {
    const html = renderLeadEmail({
      name: "Иван",
      phone: "+7 900 000-00-00",
      attachmentCount: 2,
      utm: { source: "yandex", medium: "cpc", campaign: "parts" },
      escape: identity,
    });

    expect(html).toContain("Вложений: 2");
    expect(html).toContain("source=yandex");
    expect(html).toContain("medium=cpc");
    expect(html).toContain("campaign=parts");
  });

  it("escapes HTML in user-provided values", () => {
    const escape = (value: string) =>
      value
        .replace(/&/gu, "&amp;")
        .replace(/</gu, "&lt;")
        .replace(/>/gu, "&gt;");

    const html = renderLeadEmail({
      name: "<script>x</script>",
      phone: "+7",
      message: "a & b < c",
      escape,
    });

    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("a &amp; b &lt; c");
    expect(html).not.toContain("<script>x</script>");
  });
});

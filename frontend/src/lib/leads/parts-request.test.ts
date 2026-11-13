import { describe, expect, it } from "vitest";

import { normalizePartsRequestItems, parsePartsRequest } from "./parts-request";

describe("parsePartsRequest", () => {
  it("normalizes lines, ignores blanks and combines duplicate articles", () => {
    expect(
      parsePartsRequest("\n RE504836 — 2 шт.\nAL 166181 - 1\nre504836  3\n \n"),
    ).toEqual({
      items: [
        { article: "RE504836", quantity: 5 },
        { article: "AL166181", quantity: 1 },
      ],
      error: null,
    });
  });

  it("keeps an article without quantity as one item", () => {
    expect(parsePartsRequest("r123456")).toEqual({
      items: [{ article: "R123456", quantity: 1 }],
      error: null,
    });
  });

  it("keeps spaced article numbers intact unless quantity is explicit", () => {
    expect(parsePartsRequest("RE 50483").items).toEqual([
      { article: "RE50483", quantity: 1 },
    ]);
    expect(parsePartsRequest("AB 123 C")).toEqual({
      items: [{ article: "AB123C", quantity: 1 }],
      error: null,
    });
  });

  it("parses tab-separated spreadsheet rows and preserves spaced SKUs", () => {
    expect(parsePartsRequest("RE 50483\t2\nAL166181\t1")).toEqual({
      items: [
        { article: "RE50483", quantity: 2 },
        { article: "AL166181", quantity: 1 },
      ],
      error: null,
    });
  });

  it("accepts alphabetic SKUs when Excel provides a quantity column", () => {
    expect(parsePartsRequest("FILTER\t2")).toEqual({
      items: [{ article: "FILTER", quantity: 2 }],
      error: null,
    });
  });

  it("accepts an explicit dash quantity for an alphabetic SKU", () => {
    expect(parsePartsRequest("FILTER - 2")).toEqual({
      items: [{ article: "FILTER", quantity: 2 }],
      error: null,
    });
  });

  it("reads single-space quantities after a SKU while retaining numeric SKU suffixes", () => {
    expect(parsePartsRequest("RE504836 2\nRE 50483\nRE-504837 3")).toEqual({
      items: [
        { article: "RE504836", quantity: 2 },
        { article: "RE50483", quantity: 1 },
        { article: "RE-504837", quantity: 3 },
      ],
      error: null,
    });
  });

  it.each(["RE504836  0", "RE504836 0", "RE504836\t-2", "RE504836\tnope"])(
    "rejects malformed quantities and reports the source line for %s",
    (line) => {
      expect(parsePartsRequest(`RE123456\n${line}`).error).toContain("2");
    },
  );

  it.each(["RE504836 -2", "RE504836 2.5", "RE504836\t-2", "RE504836\t2.5", "RE504836 - 2.5"])(
    "rejects negative or fractional quantities in %s",
    (line) => {
      expect(parsePartsRequest(line).error).not.toBeNull();
    },
  );

  it("does not return a partial list when one line is invalid", () => {
    expect(parsePartsRequest("RE123456\t1\nnot a valid line!")).toEqual({
      items: [],
      error: "Проверьте строки: 2.",
    });
  });

  it("recognizes a quantity after a SKU containing digits but ending in a letter", () => {
    expect(parsePartsRequest("AB123C 2")).toEqual({
      items: [{ article: "AB123C", quantity: 2 }],
      error: null,
    });
  });

  it("rejects quantities over the API limit, including duplicate sums", () => {
    expect(parsePartsRequest("RE123456\t100001").error).toContain("100000");
    expect(parsePartsRequest("RE123456\t60000\nRE123456\t60000")).toEqual({
      items: [],
      error: "Количество одного артикула не может превышать 100000.",
    });
  });

  it("rejects a request outside the supported item limit", () => {
    expect(parsePartsRequest("")).toEqual({
      items: [],
      error: "Добавьте от 1 до 100 уникальных артикулов.",
    });
    expect(
      parsePartsRequest(
        Array.from({ length: 101 }, (_, index) => `RE${index}`).join("\n"),
      ).error,
    ).toBe("Добавьте от 1 до 100 уникальных артикулов.");
  });

  it("deduplicates a structured request received by the server", () => {
    expect(
      normalizePartsRequestItems([
        { article: "re 504836", quantity: 2 },
        { article: "RE504836", quantity: 3 },
      ]),
    ).toEqual([{ article: "RE504836", quantity: 5 }]);
  });
});

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

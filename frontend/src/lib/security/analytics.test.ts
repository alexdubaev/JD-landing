import { describe, expect, it } from "vitest";

import { parseGtmId, parseMetricaId } from "./analytics";

describe("analytics identifiers", () => {
  it("accepts valid GTM and Metrica identifiers", () => {
    expect(parseGtmId("GTM-ABC1234")).toBe("GTM-ABC1234");
    expect(parseMetricaId("12345678")).toBe("12345678");
  });

  it("rejects JavaScript interpolation payloads", () => {
    expect(parseGtmId("GTM-X');alert(1)//")).toBeNull();
    expect(parseMetricaId("1,init);alert(1)//")).toBeNull();
  });
});

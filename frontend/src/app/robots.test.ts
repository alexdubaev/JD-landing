import { expect, it } from "vitest";
import robots from "./robots";
it("allows crawlers to read noindex on service pages, while blocking APIs", () => {
  const rules = robots().rules;
  expect(rules).toEqual([{ userAgent: "*", allow: "/", disallow: ["/api/"] }]);
});

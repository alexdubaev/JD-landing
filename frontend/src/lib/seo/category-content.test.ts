import { expect, it } from "vitest";

import { getCategorySeoContent } from "./category-content";

it("provides editorial copy for the engine category", () => {
  const content = getCategorySeoContent("dvigatel");

  expect(content?.metaDescription).toMatch(/детал/i);
  expect(content?.selectionPoints).not.toHaveLength(0);
});

it("returns null for an unmapped category", () => {
  expect(getCategorySeoContent("not-a-category")).toBeNull();
});

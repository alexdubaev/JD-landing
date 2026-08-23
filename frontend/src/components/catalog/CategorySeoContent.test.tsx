import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import type { CategorySeoCopy } from "@/lib/seo/category-content";

import { CategorySeoContent } from "./CategorySeoContent";

const content: Pick<CategorySeoCopy, "intro" | "selectionPoints" | "links"> = {
  intro: "Помогаем подготовить запрос на подбор деталей двигателя.",
  selectionPoints: ["Укажите артикул детали."],
  links: [{ href: "/catalog", label: "Перейти в каталог" }],
};

it("renders selection guidance and a descriptive internal link", () => {
  render(<CategorySeoContent content={content} />);

  expect(
    screen.getByRole("heading", { level: 2, name: /как подобрать/i }),
  ).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /каталог/i })).toHaveAttribute(
    "href",
    "/catalog",
  );
});

it("renders non-empty CMS SEO text once and does not execute HTML", () => {
  render(
    <CategorySeoContent
      seoText={"Первый абзац\n\n<b>Второй</b>"}
      content={content}
    />,
  );

  expect(screen.getByText("Первый абзац")).toBeInTheDocument();
  expect(screen.getByText("<b>Второй</b>")).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: /как подобрать/i }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Перейти в каталог")).not.toBeInTheDocument();
});

it("renders CMS SEO text without a fallback object", () => {
  render(<CategorySeoContent seoText="Текст из Directus" />);

  expect(screen.getByText("Текст из Directus")).toBeInTheDocument();
});

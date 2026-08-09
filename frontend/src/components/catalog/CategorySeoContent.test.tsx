import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { CategorySeoContent } from "./CategorySeoContent";

const content = {
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

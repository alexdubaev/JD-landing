import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ArticleCardData } from "@/types/catalog";

import { ArticleCard } from "./ArticleCard";

const article = {
  id: "article-1",
  title: "Как подготовить данные",
  slug: "prepare-data",
  excerpt: "Что приложить к запросу.",
  coverImageId: null,
  imageAlt: null,
  publishedAt: "2026-07-10T09:00:00.000Z",
  categoryLabel: "Подбор запчастей",
  readingTimeMinutes: 4,
} as ArticleCardData;

describe("ArticleCard", () => {
  it("shows CMS category and reading time with a compact read action", () => {
    render(<ArticleCard article={article} />);

    expect(screen.getByText("Подбор запчастей")).toBeInTheDocument();
    expect(screen.getByText("4 мин чтения")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Читать" })).toHaveAttribute(
      "href",
      "/articles/prepare-data",
    );
  });

  it("does not render absent optional article metadata", () => {
    render(
      <ArticleCard
        article={{ ...article, categoryLabel: null, readingTimeMinutes: null } as ArticleCardData}
      />,
    );

    expect(screen.queryByText("Подбор запчастей")).not.toBeInTheDocument();
    expect(screen.queryByText(/мин чтения/)).not.toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { PageSection } from "@/types/content";

import { HomeSelection } from "./HomeSelection";

const section: PageSection = {
  id: "process",
  type: "process",
  title: "Как происходит подбор",
  subtitle: null,
  text: null,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder: 1,
};

describe("HomeSelection", () => {
  it("uses the four concise plan fallback steps when CMS items are absent", () => {
    render(<HomeSelection section={section} />);

    expect(screen.getByRole("list", { name: "Этапы подбора" })).toHaveClass("home-selection__rail");
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Отправьте номера деталей" })).toBeInTheDocument();
    expect(screen.getByText("Вставьте артикулы, загрузите Excel или прикрепите фото")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Мы проверим запрос" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Получите предложение" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Оформите поставку" })).toBeInTheDocument();
  });

  it("renders the steps configured in the CMS even when not exactly four", () => {
    render(
      <HomeSelection
        section={{
          ...section,
          items: [
            { title: "CMS 1", text: "Текст" },
            { title: "CMS 2", text: "Текст" },
            { title: "CMS 3", text: "Текст" },
          ],
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "CMS 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CMS 3" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Оформите поставку" })).not.toBeInTheDocument();
  });

  it("uses CMS steps only when all four are valid", () => {
    render(
      <HomeSelection
        section={{
          ...section,
          items: Array.from({ length: 4 }, (_, index) => ({
            title: `CMS ${index + 1}`,
            text: `Текст ${index + 1}`,
          })),
        }}
      />,
    );

    expect(screen.getByRole("heading", { name: "CMS 4" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Оформите поставку" })).not.toBeInTheDocument();
  });
});

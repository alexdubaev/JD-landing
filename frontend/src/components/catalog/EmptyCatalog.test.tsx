import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EmptyCatalog } from "./EmptyCatalog";
it("lets a customer request the searched part without retyping their query", () => {
  render(<EmptyCatalog search="RE504836" />);
  expect(screen.getByRole("textbox", { name: "Что нужно подобрать" })).toHaveValue("Помогите подобрать: RE504836");
  expect(screen.getByRole("button", { name: "Отправить заявку" })).toBeInTheDocument();
});

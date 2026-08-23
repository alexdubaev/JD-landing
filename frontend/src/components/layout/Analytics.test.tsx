import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { COOKIE_CONSENT_STORAGE_KEY, Analytics } from "./Analytics";

describe("Analytics consent", () => {
  afterEach(() => {
    window.localStorage.clear();
    document.querySelector("#yandex-metrica")?.remove();
    document.querySelector("#gtm-base")?.remove();
  });

  it("shows the cookie banner and does not load analytics before a choice", () => {
    render(<Analytics yandexMetricaId="111313911" />);

    expect(screen.getByRole("dialog", { name: "Настройки cookie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять аналитику" })).toBeInTheDocument();
    expect(document.querySelector("#yandex-metrica")).not.toBeInTheDocument();
  });

  it("loads Yandex Metrica only after analytics consent", async () => {
    render(<Analytics yandexMetricaId="111313911" />);

    fireEvent.click(screen.getByRole("button", { name: "Принять аналитику" }));

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
    await waitFor(() =>
      expect(document.querySelector("#yandex-metrica")).toBeInTheDocument(),
    );
  });

  it("keeps analytics disabled after choosing only necessary cookies", async () => {
    render(<Analytics yandexMetricaId="111313911" />);

    fireEvent.click(screen.getByRole("button", { name: "Только необходимые" }));

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("declined");
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Настройки cookie" })).not.toBeInTheDocument(),
    );
    expect(document.querySelector("#yandex-metrica")).not.toBeInTheDocument();
  });
});

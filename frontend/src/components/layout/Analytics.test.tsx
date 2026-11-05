import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { configureAnalyticsProviders, flushMetricaEvents, setAnalyticsConsent, trackEvent } from "@/lib/analytics";
import { CartProvider } from "@/lib/cart/context";
import { COOKIE_CONSENT_STORAGE_KEY, Analytics } from "./Analytics";

describe("Analytics consent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    configureAnalyticsProviders({ metricaId: null, gtmId: null });
    setAnalyticsConsent(null);
    delete window.dataLayer;
    delete window.ym;
    delete window.__jdMetricaInitialized;
    window.localStorage.clear();
    document.querySelector("#yandex-metrica")?.remove();
    document.querySelector("#gtm-base")?.remove();
    document
      .querySelectorAll('[id^="yandex-metrica-"], [id^="gtm-base-"]')
      .forEach((script) => script.remove());
  });

  it("shows the cookie banner and does not load analytics before a choice", () => {
    render(<Analytics yandexMetricaId="111313911" />);

    expect(screen.getByRole("dialog", { name: "Настройки cookie" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Принять аналитику" })).toBeInTheDocument();
    expect(document.querySelector("#yandex-metrica")).not.toBeInTheDocument();
  });

  it("loads Yandex Metrica only after analytics consent", async () => {
    const view = render(<Analytics yandexMetricaId="111313911" />);

    fireEvent.click(screen.getByRole("button", { name: "Принять аналитику" }));

    expect(window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)).toBe("accepted");
    await waitFor(() =>
      expect(document.querySelector("#yandex-metrica-111313911")).toBeInTheDocument(),
    );
    view.rerender(<Analytics yandexMetricaId="111313911" />);
    expect(document.querySelectorAll("#yandex-metrica-111313911")).toHaveLength(1);
    expect(document.querySelector("#yandex-metrica-111313911")?.textContent).toContain(
      "window.__jdMetricaInitialized",
    );
  });

  it("loads a new script identity when the provider counter changes", async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");
    const view = render(
      <Analytics yandexMetricaId="33333331" gtmId="GTM-AAA111" />,
    );

    await waitFor(() => {
      expect(document.querySelector("#yandex-metrica-33333331")).toBeInTheDocument();
      expect(document.querySelector("#gtm-base-GTM-AAA111")).toBeInTheDocument();
    });

    view.rerender(
      <CartProvider>
        <Analytics yandexMetricaId="33333332" gtmId="GTM-BBB222" />
      </CartProvider>,
    );

    await waitFor(() => {
      expect(document.querySelector("#yandex-metrica-33333332")).toBeInTheDocument();
      expect(document.querySelector("#gtm-base-GTM-BBB222")).toBeInTheDocument();
    });
    expect(document.querySelector("#yandex-metrica-33333332")?.textContent).toContain(
      'ym(33333332, "init"',
    );
    expect(document.querySelector("#gtm-base-GTM-BBB222")?.textContent).toContain(
      "GTM-BBB222",
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

  it("restores accepted consent without showing the banner", async () => {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, "accepted");

    render(<Analytics yandexMetricaId="222222222" />);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Настройки cookie" })).not.toBeInTheDocument();
    });
  });

  it("tracks with the current provider after explicit consent when localStorage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage unavailable");
    });
    const view = render(
      <Analytics yandexMetricaId="11111111" gtmId="GTM-ABC123" />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Принять аналитику" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Настройки cookie" })).not.toBeInTheDocument(),
    );

    trackEvent("lead_submit", { source: "storage-unavailable" });
    expect(window.dataLayer).toEqual([
      { event: "lead_submit", source: "storage-unavailable" },
    ]);

    const calls: unknown[][] = [];
    window.ym = (...args: unknown[]) => calls.push(args);
    window.__jdMetricaInitialized = { "11111111": true };
    flushMetricaEvents();
    expect(calls).toEqual([
      ["11111111", "reachGoal", "lead_submit", { source: "storage-unavailable" }],
    ]);

    view.rerender(
      <CartProvider>
        <Analytics yandexMetricaId="22222222" gtmId="GTM-NEW123" />
      </CartProvider>,
    );
    window.__jdMetricaInitialized["22222222"] = true;
    trackEvent("phone_click", { label: "updated-provider" });
    expect(window.dataLayer).toEqual([
      { event: "lead_submit", source: "storage-unavailable" },
      { event: "phone_click", label: "updated-provider" },
    ]);
    expect(calls).toEqual([
      ["11111111", "reachGoal", "lead_submit", { source: "storage-unavailable" }],
      ["22222222", "reachGoal", "phone_click", { label: "updated-provider" }],
    ]);
  });

  it("does not load a provider script when its CMS identifier is absent", async () => {
    render(<Analytics />);

    fireEvent.click(screen.getByRole("button", { name: "Принять аналитику" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Настройки cookie" })).not.toBeInTheDocument(),
    );
    expect(document.querySelector("#yandex-metrica")).not.toBeInTheDocument();
    expect(document.querySelector("#gtm-base")).not.toBeInTheDocument();
  });

});

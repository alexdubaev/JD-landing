import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Analytics } from "./Analytics";

afterEach(() => {
  document.querySelectorAll('script[src="/analytics-loader.js"]').forEach((script) => script.remove());
});

describe("Analytics", () => {
  it("emits only a same-origin loader for validated analytics identifiers", () => {
    render(
      <Analytics gtmId="GTM-ABC1234" yandexMetricaId="12345678" />,
    );

    const script = document.querySelector('script[src="/analytics-loader.js"]');
    expect(script).toHaveAttribute("data-gtm-id", "GTM-ABC1234");
    expect(script).toHaveAttribute("data-metrica-id", "12345678");
    expect(document.querySelectorAll('script[src="/analytics-loader.js"]')).toHaveLength(1);
    expect(script?.textContent).toBe("");
  });

  it("does not render a loader for stored XSS payloads", () => {
    render(
      <Analytics
        gtmId="GTM-X');alert(1)//"
        yandexMetricaId={'1, "init");alert(1)//'}
      />,
    );

    expect(document.querySelector('script[src="/analytics-loader.js"]')).toBeNull();
  });
});

"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      size: "compact" | "flexible";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

export function TurnstileField() {
  const container = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const [token, setToken] = useState("");

  const renderWidget = useCallback(() => {
    if (!siteKey || !container.current || !window.turnstile || widgetId.current) return;
    widgetId.current = window.turnstile.render(container.current, {
      sitekey: siteKey,
      size: window.matchMedia("(max-width: 22rem)").matches ? "compact" : "flexible",
      callback: setToken,
      "error-callback": () => setToken(""),
      "expired-callback": () => setToken(""),
      "timeout-callback": () => setToken(""),
    });
  }, []);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [renderWidget]);

  if (!siteKey) return null;

  return (
    <div className="turnstile-field">
      <Script
        id="cloudflare-turnstile"
        onReady={renderWidget}
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
      />
      <div ref={container} />
      <input name="turnstile_token" type="hidden" value={token} />
    </div>
  );
}

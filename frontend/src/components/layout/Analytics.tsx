"use client";

import Link from "next/link";
import Script from "next/script";
import { useEffect, useState } from "react";

type AnalyticsProps = {
  yandexMetricaId?: string | null;
  gtmId?: string | null;
};

export const COOKIE_CONSENT_STORAGE_KEY = "deere-shop:cookie-consent";

type CookieConsentChoice = "accepted" | "declined";
type ConsentState = CookieConsentChoice | "unknown";

function readConsent(): CookieConsentChoice | null {
  try {
    const value = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    return value === "accepted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

function writeConsent(choice: CookieConsentChoice): void {
  try {
    window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, choice);
  } catch {
    // Storage may be unavailable; the current page choice still applies.
  }
}

/**
 * Shows the cookie choice before loading optional analytics. Necessary
 * technical storage is not blocked; Yandex Metrica and GTM wait for consent.
 */
export function Analytics({ yandexMetricaId, gtmId }: AnalyticsProps) {
  const [consent, setConsent] = useState<ConsentState>("unknown");
  const metrica = yandexMetricaId?.trim();
  const gtm = gtmId?.trim();

  useEffect(() => {
    const storedConsent = readConsent();
    if (!storedConsent) return;

    const timer = window.setTimeout(() => setConsent(storedConsent), 0);
    return () => window.clearTimeout(timer);
  }, []);

  function chooseConsent(choice: CookieConsentChoice) {
    writeConsent(choice);
    setConsent(choice);
  }

  const analyticsAllowed = consent === "accepted";

  return (
    <>
      {consent === "unknown" ? (
        <aside
          aria-label="Настройки cookie"
          className="cookie-consent"
          role="dialog"
        >
          <div className="cookie-consent__content">
            <strong>Файлы cookie</strong>
            <p>
              Мы используем необходимые файлы cookie для работы сайта и, с
              вашего согласия, аналитику посещаемости. Подробнее — в{" "}
              <Link href="/privacy-policy">политике конфиденциальности</Link>.
            </p>
          </div>
          <div className="cookie-consent__actions">
            <button
              className="button button--primary"
              onClick={() => chooseConsent("accepted")}
              type="button"
            >
              Принять аналитику
            </button>
            <button
              className="button button--ghost"
              onClick={() => chooseConsent("declined")}
              type="button"
            >
              Только необходимые
            </button>
          </div>
        </aside>
      ) : null}

      {analyticsAllowed && gtm ? (
        <Script id="gtm-base" strategy="afterInteractive">
          {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`}
        </Script>
      ) : null}

      {analyticsAllowed && metrica ? (
        <Script id="yandex-metrica" strategy="afterInteractive">
          {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();
for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");

ym(${metrica}, "init", {
clickmap:true,
trackLinks:true,
accurateTrackBounce:true,
webvisor:true
});`}
        </Script>
      ) : null}
    </>
  );
}

import Script from "next/script";

import { parseGtmId, parseMetricaId } from "@/lib/security/analytics";

type AnalyticsProps = {
  yandexMetricaId?: string | null;
  gtmId?: string | null;
};

/** Renders one same-origin loader; CMS values are validated before serialization. */
export function Analytics({ yandexMetricaId, gtmId }: AnalyticsProps) {
  const metrica = parseMetricaId(yandexMetricaId);
  const gtm = parseGtmId(gtmId);

  if (!metrica && !gtm) return null;

  return (
    <Script
      data-gtm-id={gtm ?? undefined}
      data-metrica-id={metrica ?? undefined}
      id="analytics-loader"
      src="/analytics-loader.js"
      strategy="afterInteractive"
    />
  );
}

import Script from "next/script";

type AnalyticsProps = {
  yandexMetricaId?: string | null;
  gtmId?: string | null;
};

/**
 * Injects analytics snippets (Yandex Metrica and/or Google Tag Manager)
 * based on IDs configured in site_settings. Each snippet is only rendered
 * when its ID is present, so the site stays tracking-free until configured.
 */
export function Analytics({ yandexMetricaId, gtmId }: AnalyticsProps) {
  const metrica = yandexMetricaId?.trim();
  const gtm = gtmId?.trim();

  if (!metrica && !gtm) return null;

  return (
    <>
      {gtm ? (
        <>
          <Script id="gtm-base" strategy="afterInteractive">
            {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`}
          </Script>
          <noscript>
            <iframe
              height="0"
              src={`https://www.googletagmanager.com/ns.html?id=${gtm}`}
              style={{ display: "none", visibility: "hidden" }}
              width="0"
            />
          </noscript>
        </>
      ) : null}

      {metrica ? (
        <>
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
          <noscript>
            <div>
              {/* Yandex Metrica noscript tracking pixel — next/image cannot run inside <noscript> */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                alt=""
                src={`https://mc.yandex.ru/watch/${metrica}`}
                style={{ position: "absolute", left: "-9999px" }}
              />
            </div>
          </noscript>
        </>
      ) : null}
    </>
  );
}

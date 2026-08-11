(() => {
  const loader = document.currentScript;
  if (!(loader instanceof HTMLScriptElement)) return;
  const gtmId = loader.dataset.gtmId;
  const metricaId = loader.dataset.metricaId;
  const appendScript = (src) => {
    const script = document.createElement("script");
    script.async = true;
    script.src = src;
    document.head.append(script);
  };
  if (gtmId) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
    appendScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtmId)}`);
  }
  if (metricaId) {
    window.ym = window.ym || function () { (window.ym.a = window.ym.a || []).push(arguments); };
    window.ym.l = Date.now();
    appendScript("https://mc.yandex.ru/metrika/tag.js");
    window.ym(Number(metricaId), "init", { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: true });
  }
})();

const GTM_ID = /^GTM-[A-Z0-9]{6,}$/u;
const METRICA_ID = /^\d{6,9}$/u;

export function parseGtmId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id && GTM_ID.test(id) ? id : null;
}

export function parseMetricaId(value: string | null | undefined): string | null {
  const id = value?.trim();
  return id && METRICA_ID.test(id) ? id : null;
}

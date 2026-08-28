const ruDateFormatter = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "long",
  year: "numeric",
});

/** Long Russian date ("17 августа 2026 г.") for ISO strings. */
export function formatRuDate(iso: string): string {
  return ruDateFormatter.format(new Date(iso));
}

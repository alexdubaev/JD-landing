/**
 * Format a monetary amount in the project's Russian-locale convention.
 *
 * `maximumFractionDigits` defaults to 0 because the catalog shows whole-ruble
 * prices; callers that need fractional precision (e.g. a snapshot total) can
 * opt in.
 */
export function formatPrice(
  amount: number,
  currency = "RUB",
  maximumFractionDigits = 0,
): string {
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits,
  }).format(amount);
}

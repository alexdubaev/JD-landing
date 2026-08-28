import type { ProductCardData } from "@/types/catalog";

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

/**
 * Price line for a product card or detail page: fixed wording for
 * on-request/hidden/unset prices, otherwise the formatted amount.
 */
export function formatProductPrice(
  product: Pick<ProductCardData, "price" | "priceStatus" | "currency">,
): string {
  if (product.priceStatus === "on_request") return "Цена по запросу";
  if (product.priceStatus === "hidden" || product.price == null) {
    return "Уточнить условия";
  }
  return formatPrice(product.price, product.currency);
}

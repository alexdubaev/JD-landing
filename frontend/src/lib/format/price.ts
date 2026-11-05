import type { ProductCardData } from "@/types/catalog";

/**
 * Format a monetary amount in the project's Russian-locale convention.
 *
 * Keep whole-ruble prices compact, but retain cents when the amount has them
 * so catalogue, cart and persisted order amounts agree.
 */
export function formatPrice(
  amount: number,
  currency = "RUB",
  maximumFractionDigits = Number.isInteger(amount) ? 0 : 2,
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

"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";

import { useCart } from "@/lib/cart/context";

/**
 * Cart icon + live counter for the site header.
 * Links to /cart (the checkout page, added in a later stage). Until that page
 * exists the link still works as an anchor; the badge just reflects the count.
 */
export function CartBadge() {
  const { count, hydrated } = useCart();

  return (
    <Link
      aria-label={
        hydrated && count > 0
          ? `Корзина, товаров: ${count}`
          : "Корзина"
      }
      className="site-header__cart"
      href="/cart"
    >
      <ShoppingCart aria-hidden="true" />
      {hydrated && count > 0 ? (
        <span className="site-header__cart-count" aria-live="polite">
          {count}
        </span>
      ) : null}
    </Link>
  );
}

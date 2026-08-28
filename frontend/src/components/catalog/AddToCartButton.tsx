"use client";

import { Minus, Plus, ShoppingCart } from "lucide-react";
import { useState } from "react";

import { useCart, QUANTITY_MAX, isPurchasable } from "@/lib/cart/context";
import { trackEvent } from "@/lib/analytics";
import type { Product } from "@/types/catalog";

/**
 * Quantity stepper + add-to-cart control for the product detail page.
 * Renders nothing for non-purchasable products (no fixed price); those stay on
 * the consultation/lead flow.
 */
export function AddToCartButton({ product }: { product: Product }) {
  const { addToCart, has: hasInCart, quantityOf } = useCart();
  const [qty, setQty] = useState(1);

  if (!isPurchasable(product)) return null;

  const inCart = hasInCart(product.id);
  const cartQty = quantityOf(product.id);

  const handleAdd = () => {
    addToCart(product, qty);
    trackEvent("product_add_to_cart", {
      product_id: product.id,
      quantity: qty,
    });
    setQty(1);
  };

  return (
    <div className="add-to-cart">
      <div
        className="qty-stepper"
        role="group"
        aria-label="Количество товара"
      >
        <button
          aria-label="Уменьшить количество"
          className="qty-stepper__btn"
          onClick={() => setQty((q) => Math.max(1, q - 1))}
          type="button"
        >
          <Minus aria-hidden="true" />
        </button>
        <output className="qty-stepper__value" aria-live="polite">
          {qty}
        </output>
        <button
          aria-label="Увеличить количество"
          className="qty-stepper__btn"
          onClick={() => setQty((q) => Math.min(QUANTITY_MAX, q + 1))}
          type="button"
        >
          <Plus aria-hidden="true" />
        </button>
      </div>
      <button
        className="button button--primary add-to-cart__btn"
        onClick={handleAdd}
        type="button"
      >
        <ShoppingCart aria-hidden="true" />
        В корзину
      </button>
      {inCart ? (
        <p className="add-to-cart__status" role="status">
          В корзине: {cartQty} шт.
        </p>
      ) : null}
    </div>
  );
}

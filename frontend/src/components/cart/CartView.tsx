"use client";

import { Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";

import { CheckoutForm } from "./CheckoutForm";
import { directusAssetUrl } from "@/lib/directus/assets";
import { formatPrice } from "@/lib/format/price";
import { useCart } from "@/lib/cart/context";

export function CartView() {
  const { hydrated, lines, total, count, increment, decrement, removeFromCart } =
    useCart();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  // Avoid a flash of "empty" before localStorage hydrates on first paint.
  if (!hydrated) {
    return <div className="cart-view" aria-busy="true" />;
  }

  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <ShoppingCart aria-hidden="true" className="cart-empty__icon" />
        <h2 className="cart-empty__title">Корзина пуста</h2>
        <p className="cart-empty__text">
          Добавьте товары с фиксированной ценой из каталога, чтобы оформить
          заказ.
        </p>
        <Link className="button button--primary cart-empty__cta" href="/catalog">
          Перейти в каталог
        </Link>
      </div>
    );
  }

  return (
    <div className="cart-view">
      <div className="cart-view__items">
        <p className="cart-view__count">
          {count} {pluralize(count, "товар", "товара", "товаров")}
        </p>
        <ul className="cart-lines">
          {lines.map((line) => {
            const imageUrl = directusAssetUrl(line.mainImageId, {
              width: 200,
              height: 200,
              fit: "cover",
              quality: 80,
              format: "webp",
            });
            const productUrl = line.href;
            const lineTotal = line.unitPrice * line.quantity;
            return (
              <li className="cart-line" key={line.id}>
                <div className="cart-line__media">
                  {imageUrl ? (
                    <Image
                      alt={line.imageAlt || line.title}
                      fill
                      sizes="5rem"
                      src={imageUrl}
                    />
                  ) : (
                    <span className="cart-line__media-placeholder" aria-hidden="true">
                      <ShoppingCart />
                    </span>
                  )}
                </div>
                <div className="cart-line__info">
                  <Link className="cart-line__title" href={productUrl}>
                    {line.title}
                  </Link>
                  <p className="cart-line__sku">Артикул: {line.sku}</p>
                  <p className="cart-line__unit">
                    {formatPrice(line.unitPrice, line.currency)} / шт.
                  </p>
                </div>
                <div
                  className="qty-stepper qty-stepper--sm"
                  role="group"
                  aria-label={`Количество: ${line.title}`}
                >
                  <button
                    aria-label="Уменьшить количество"
                    className="qty-stepper__btn"
                    onClick={() => decrement(line.id)}
                    type="button"
                  >
                    <Minus aria-hidden="true" />
                  </button>
                  <output
                    className="qty-stepper__value"
                    aria-live="polite"
                  >
                    {line.quantity}
                  </output>
                  <button
                    aria-label="Увеличить количество"
                    className="qty-stepper__btn"
                    onClick={() => increment(line.id)}
                    type="button"
                  >
                    <Plus aria-hidden="true" />
                  </button>
                </div>
                <strong className="cart-line__price">
                  {formatPrice(lineTotal, line.currency)}
                </strong>
                <button
                  aria-label={`Удалить ${line.title} из корзины`}
                  className="cart-line__remove"
                  onClick={() => removeFromCart(line.id)}
                  type="button"
                >
                  <Trash2 aria-hidden="true" />
                  <span>Удалить</span>
                </button>
              </li>
            );
          })}
        </ul>
        <div className="cart-view__footer">
          <Link className="cart-view__continue" href="/catalog">
            ← Продолжить выбор
          </Link>
        </div>
      </div>
      <aside className="cart-view__aside">
        <section className="order-summary">
          <h2 className="order-summary__title">Ваш заказ</h2>
          <div className="order-summary__row">
            <span>Товары ({count})</span>
            <span>{formatPrice(total)}</span>
          </div>
          <p className="order-summary__note">
            Доставка и сроки подтверждаются менеджером после проверки наличия.
            Оплата — по счёту после согласования.
          </p>
          <div className="order-summary__total">
            <span>Итого</span>
            <strong>{formatPrice(total)}</strong>
          </div>
          {checkoutOpen ? (
            <CheckoutForm />
          ) : (
            <button
              className="button button--primary order-summary__submit"
              onClick={() => setCheckoutOpen(true)}
              type="button"
            >
              Оформить заказ
            </button>
          )}
        </section>
      </aside>
    </div>
  );
}

function pluralize(n: number, one: string, few: string, many: string) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return few;
  return many;
}

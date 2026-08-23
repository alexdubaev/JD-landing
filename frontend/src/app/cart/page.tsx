import type { Metadata } from "next";

import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/ui/Container";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = {
  title: "Корзина",
  description: "Выбранные товары и оформление заказа.",
  alternates: { canonical: "/cart" },
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return (
    <main className="cart-page" id="main-content">
      <div className="cart-page__heading">
        <Container>
          <Breadcrumbs
            items={[
              { label: "Главная", href: "/" },
              { label: "Корзина" },
            ]}
          />
          <h1>Корзина</h1>
          <p>Проверьте позиции и оформите заявку. Менеджер подтвердит наличие и сроки.</p>
        </Container>
      </div>
      <Container>
        <CartView />
      </Container>
    </main>
  );
}

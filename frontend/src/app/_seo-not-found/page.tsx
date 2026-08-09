import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

export const metadata: Metadata = {
  title: "Страница не найдена",
  description: "Запрошенная страница не существует или была перемещена.",
  robots: { index: false, follow: true },
};

export default function SeoNotFoundPage() {
  return (
    <main className="page-state" id="main-content">
      <Container>
        <p className="section-eyebrow">Ошибка 404</p>
        <h1>Страница не найдена</h1>
        <p>Проверьте адрес или перейдите в каталог комплектующих.</p>
        <Link className="button button--primary" href="/catalog">Перейти в каталог</Link>
      </Container>
    </main>
  );
}

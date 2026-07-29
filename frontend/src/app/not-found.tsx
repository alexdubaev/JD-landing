import Link from "next/link";

import { Container } from "@/components/ui/Container";

export default function NotFoundPage() {
  return (
    <main className="page-state" id="main-content">
      <Container>
        <p className="section-eyebrow">Ошибка 404</p>
        <h1>Страница не найдена</h1>
        <p>Возможно, адрес изменился или товар больше не опубликован.</p>
        <Link className="button button--primary" href="/catalog">
          Перейти в каталог
        </Link>
      </Container>
    </main>
  );
}

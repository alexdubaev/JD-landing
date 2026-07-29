"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="page-state" id="main-content">
      <div className="site-container">
        <p className="section-eyebrow">Временная ошибка</p>
        <h1>Не удалось загрузить данные каталога</h1>
        <p>Повторите попытку. Если ошибка сохранится, свяжитесь с нами.</p>
        <button className="button button--primary" onClick={reset} type="button">
          Повторить
        </button>
      </div>
    </main>
  );
}

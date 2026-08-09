import { Container } from "@/components/ui/Container";

export default function Loading() {
  return (
    <main className="page-state" id="main-content">
      <Container>
        <div aria-label="Загрузка страницы" className="page-state__skeleton" />
        <div className="page-state__skeleton page-state__skeleton--wide" />
      </Container>
    </main>
  );
}

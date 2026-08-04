import { Container } from "@/components/ui/Container";

export default function CategoryLoading() {
  return (
    <main className="catalog-page" id="main-content">
      <Container>
        <div aria-label="Категория загружается" className="catalog-loading">
          <div />
          <div />
          <div />
          <div />
        </div>
      </Container>
    </main>
  );
}

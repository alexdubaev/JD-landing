import { Container } from "@/components/ui/Container";

export default function CatalogLoading() {
  return (
    <main className="catalog-page" id="main-content">
      <Container>
        <div aria-label="Каталог загружается" className="catalog-loading">
          <div />
          <div />
          <div />
          <div />
        </div>
      </Container>
    </main>
  );
}

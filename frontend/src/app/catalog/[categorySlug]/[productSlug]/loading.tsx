import { Container } from "@/components/ui/Container";

export default function ProductLoading() {
  return (
    <main className="product-page" id="main-content">
      <Container>
        <div aria-label="Товар загружается" className="catalog-loading">
          <div />
          <div />
          <div />
          <div />
        </div>
      </Container>
    </main>
  );
}

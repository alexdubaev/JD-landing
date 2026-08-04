import { Container } from "@/components/ui/Container";

export default function ArticlesLoading() {
  return (
    <main className="page-state" id="main-content">
      <Container>
        <div aria-label="Статьи загружаются" className="page-state__skeleton" />
        <div className="page-state__skeleton page-state__skeleton--wide" />
      </Container>
    </main>
  );
}

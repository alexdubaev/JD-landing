import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import {
  getFeaturedProducts,
  getHomepageCategories,
} from "@/lib/directus/catalog";
import {
  getFaqItems,
  getHomePage,
  getSiteSettings,
} from "@/lib/directus/content";

import { HomePageView } from "./HomePageView";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const page = await getHomePage();
    if (!page) return {};
    return {
      title: page.seoTitle ?? page.title,
      description: page.seoDescription,
      alternates: { canonical: "/" },
    };
  } catch {
    return {};
  }
}

export default async function HomePage() {
  const data = await loadHomePageData();

  if (!data?.page) {
    return <CmsUnavailable />;
  }

  const faq = await getFaqItems({ pageId: data.page.id }).catch(() => []);
  return (
    <HomePageView
      categories={data.categories}
      faq={faq}
      page={data.page}
      products={data.products}
      settings={data.settings}
    />
  );
}

async function loadHomePageData() {
  try {
    const [page, settings, categories, products] = await Promise.all([
      getHomePage(),
      getSiteSettings(),
      getHomepageCategories(),
      getFeaturedProducts(8),
    ]);
    return { page, settings, categories, products };
  } catch (error) {
    console.error("Failed to load homepage CMS data", error);
    return null;
  }
}

function CmsUnavailable() {
  return (
    <main className="cms-unavailable" id="main-content">
      <Container>
        <p>Каталог временно обновляется</p>
        <h1>Мы готовим актуальные данные каталога</h1>
        <p>
          Попробуйте открыть страницу позже или свяжитесь с нами для подбора
          комплектующих.
        </p>
        <Link className="button button--primary" href="/contacts">
          Перейти к контактам
        </Link>
      </Container>
    </main>
  );
}

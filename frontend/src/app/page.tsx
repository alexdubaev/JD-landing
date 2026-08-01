import type { Metadata } from "next";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { JsonLdSchema } from "@/components/seo/JsonLdSchema";
import { buildHomepageStructuredData } from "@/lib/seo/home";
import {
  getFeaturedProducts,
  getHomepageCategories,
} from "@/lib/directus/catalog";
import { getFeaturedArticles } from "@/lib/directus/articles";
import {
  getContacts,
  getFaqItems,
  getHomePage,
  getRecentSupplies,
  getSiteSettings,
} from "@/lib/directus/content";

import { HomePageView } from "./HomePageView";

export const dynamic = "force-dynamic";

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
  const schemas = buildHomepageStructuredData({ faq, settings: data.settings });
  return (
    <>
      {schemas.map((schema, index) => <JsonLdSchema data={schema} key={index} />)}
      <HomePageView
      categories={data.categories}
      articles={data.articles}
      contacts={data.contacts}
      faq={faq}
      page={data.page}
      products={data.products}
      supplies={data.supplies}
      settings={data.settings}
      />
    </>
  );
}

async function loadHomePageData() {
  try {
    const [page, settings, categories, products, articles, contacts, supplies] = await Promise.all([
      getHomePage(),
      getSiteSettings(),
      getHomepageCategories(),
      getFeaturedProducts(5),
      getFeaturedArticles(3),
      getContacts(),
      getRecentSupplies().catch(() => []),
    ]);
    return { page, settings, categories, products, articles, contacts, supplies };
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

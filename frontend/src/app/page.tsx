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
import { directusAssetUrl } from "@/lib/directus/assets";
import { buildSocialMetadata } from "@/lib/seo/social-metadata";
import { absoluteUrl } from "@/lib/seo/url";

// Directus is intentionally unavailable while Docker builds the frontend.
// Rendering this route at build time would persist the CMS fallback as the
// homepage, so it must first render only after the running container can
// reach Directus over the private network.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [page, settings] = await Promise.all([
      getHomePage(),
      getSiteSettings().catch(() => null),
    ]);
    if (!page) return {};
    const title = page.seoTitle ?? page.title;
    const description = page.seoDescription;
    const image = directusAssetUrl(settings?.defaultOgImageId, {
      width: 1200,
      height: 630,
    });
    return {
      title,
      description,
      alternates: { canonical: "/" },
      ...buildSocialMetadata({
        title,
        description,
        path: absoluteUrl("/"),
        image: image ? { url: image } : null,
      }),
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
  // Critical sources (page + settings) must succeed; the rest degrade
  // gracefully to empty lists so a transient Directus hiccup on a single
  // collection never serves the "Каталог временно обновляется" stub.
  try {
    const [page, settings] = await Promise.all([
      getHomePage(),
      getSiteSettings(),
    ]);
    if (!page) return null;

    const [categories, products, articles, contacts, supplies] =
      await Promise.all([
        getHomepageCategories().catch(() => []),
        getFeaturedProducts(5).catch(() => []),
        getFeaturedArticles(3).catch(() => []),
        getContacts().catch(() => []),
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

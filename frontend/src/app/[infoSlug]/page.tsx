import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentPageView } from "@/components/pages/ContentPageView";
import { JsonLdSchema } from "@/components/seo/JsonLdSchema";
import {
  getFaqItems,
  getPageBySlug,
  getSiteSettings,
} from "@/lib/directus/content";
import { absoluteUrl } from "@/lib/seo/url";
import { buildBreadcrumbSchema } from "@/lib/seo/schema";
import {
  getTrustPageFallback,
  getTrustPageMetadata,
} from "@/lib/seo/trust-pages";

const informationSlugs = new Set([
  "about",
  "delivery",
  "contacts",
  "privacy-policy",
  "thank-you",
]);

const noindexSlugs = new Set(["thank-you"]);

type Props = { params: Promise<{ infoSlug: string }> };

async function loadPage(slug: string) {
  if (!informationSlugs.has(slug)) return null;
  const page =
    (await getPageBySlug(slug).catch(() => null)) ??
    getTrustPageFallback(slug);
  if (!page) return null;
  const [faq, settings] = await Promise.all([
    getFaqItems({ pageId: page.id }),
    getSiteSettings(),
  ]);
  return { faq, page, settings };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { infoSlug } = await params;
  if (!informationSlugs.has(infoSlug)) return {};
  const page = await getPageBySlug(infoSlug).catch(() => null);
  const fallbackMetadata = getTrustPageMetadata(infoSlug);
  if (!page && !fallbackMetadata) return {};
  const isNoindex = noindexSlugs.has(infoSlug);
  return {
    title: page?.seoTitle ?? fallbackMetadata?.title ?? page?.title,
    description: page?.seoDescription ?? fallbackMetadata?.description,
    alternates: { canonical: `/${infoSlug}` },
    ...(isNoindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function InformationPage({ params }: Props) {
  const { infoSlug } = await params;
  const data = await loadPage(infoSlug);
  if (!data) notFound();
  const isNoindex = noindexSlugs.has(infoSlug);
  const url = absoluteUrl(`/${infoSlug}`);

  return (
    <>
      {!isNoindex ? (
        <JsonLdSchema
          data={buildBreadcrumbSchema([
            { name: "Главная", url: absoluteUrl("/") },
            { name: data.page.title, url },
          ])}
        />
      ) : null}
      <ContentPageView {...data} />
    </>
  );
}

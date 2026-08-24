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
import { buildSocialMetadata } from "@/lib/seo/social-metadata";
import { buildBreadcrumbSchema, buildFaqSchema } from "@/lib/seo/schema";
import {
  getTrustPageFallback,
  getTrustPageFaq,
  getTrustPageMetadata,
} from "@/lib/seo/trust-pages";
import type { SiteSettings } from "@/types/content";

const informationSlugs = new Set([
  "about",
  "delivery",
  "contacts",
  "privacy-policy",
  "thank-you",
]);

const noindexSlugs = new Set(["thank-you"]);

type Props = { params: Promise<{ infoSlug: string }> };

const fallbackSettings: SiteSettings = {
  city: null,
  companyImageId: null,
  companyName: "DEERE-SHOP",
  defaultOgImageId: null,
  documentsUrl: null,
  phone: null,
  email: null,
  address: null,
  workingHours: null,
  logoId: null,
  primaryColor: null,
  accentColor: null,
  primaryCtaText: null,
  primaryCtaUrl: null,
  footerText: null,
  footerDisclaimer: null,
  seoTitle: null,
  seoDescription: null,
  ogTitle: null,
  ogDescription: null,
  inn: null,
  kpp: null,
  legalAddress: null,
  legalName: null,
  messengers: [],
  ogrn: null,
  requisitesUrl: null,
  vatInfo: null,
  yandexMetricaId: null,
  gtmId: null,
};

async function loadPage(slug: string) {
  if (!informationSlugs.has(slug)) return null;
  const cmsPage = await getPageBySlug(slug).catch(() => null);
  const fallbackPage = getTrustPageFallback(slug);
  // The CMS remains the source of truth once editorial sections are present.
  // Short legacy records must not replace the approved public copy during the
  // transition to Directus-managed static pages.
  const page =
    cmsPage && (cmsPage.sections.length >= 3 || !fallbackPage)
      ? cmsPage
      : fallbackPage;
  if (!page) return null;
  const [cmsFaq, settings] = await Promise.all([
    cmsPage && page === cmsPage
      ? getFaqItems({ pageId: cmsPage.id }).catch(() => [])
      : Promise.resolve([]),
    getSiteSettings().catch(() => fallbackSettings),
  ]);
  const faq = cmsFaq.length ? cmsFaq : getTrustPageFaq(slug);
  return { faq, page, settings };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { infoSlug } = await params;
  if (!informationSlugs.has(infoSlug)) return {};
  const page = await getPageBySlug(infoSlug).catch(() => null);
  const fallbackMetadata = getTrustPageMetadata(infoSlug);
  if (!page && !fallbackMetadata) return {};
  const isNoindex = noindexSlugs.has(infoSlug);
  const title = page?.seoTitle ?? fallbackMetadata?.title ?? page?.title;
  const description = page?.seoDescription ?? fallbackMetadata?.description;
  if (!title) return {};
  return {
    title,
    description,
    alternates: { canonical: `/${infoSlug}` },
    ...(isNoindex ? { robots: { index: false, follow: true } } : {}),
    ...buildSocialMetadata({
      title,
      description,
      path: absoluteUrl(`/${infoSlug}`),
    }),
  };
}

export default async function InformationPage({ params }: Props) {
  const { infoSlug } = await params;
  const data = await loadPage(infoSlug);
  if (!data) notFound();
  const isNoindex = noindexSlugs.has(infoSlug);
  const url = absoluteUrl(`/${infoSlug}`);
  const showsFaq = data.page.sections.some((section) => section.type === "faq");
  const faqSchema = showsFaq ? buildFaqSchema(data.faq) : null;

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
      {faqSchema ? <JsonLdSchema data={faqSchema} /> : null}
      <ContentPageView {...data} />
    </>
  );
}

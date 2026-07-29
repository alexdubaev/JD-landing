import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ContentPageView } from "@/components/pages/ContentPageView";
import {
  getFaqItems,
  getPageBySlug,
  getSiteSettings,
} from "@/lib/directus/content";

const informationSlugs = new Set([
  "about",
  "delivery",
  "contacts",
  "privacy-policy",
  "thank-you",
]);

type Props = { params: Promise<{ infoSlug: string }> };

async function loadPage(slug: string) {
  if (!informationSlugs.has(slug)) return null;
  const page = await getPageBySlug(slug);
  if (!page) return null;
  const [faq, settings] = await Promise.all([
    getFaqItems({ pageId: page.id }),
    getSiteSettings(),
  ]);
  return { faq, page, settings };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { infoSlug } = await params;
  const page = await getPageBySlug(infoSlug).catch(() => null);
  return page
    ? {
        title: page.seoTitle ?? page.title,
        description: page.seoDescription,
        alternates: { canonical: `/${infoSlug}` },
      }
    : {};
}

export default async function InformationPage({ params }: Props) {
  const { infoSlug } = await params;
  const data = await loadPage(infoSlug);
  if (!data) notFound();
  return <ContentPageView {...data} />;
}

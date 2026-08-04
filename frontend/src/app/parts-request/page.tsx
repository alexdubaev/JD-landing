import type { Metadata } from "next";
import { notFound } from "next/navigation";

import type { PartsRequestMode } from "@/components/forms/BulkPartsRequest";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { JsonLdSchema } from "@/components/seo/JsonLdSchema";
import { HomePartsRequest } from "@/components/sections/HomePartsRequest";
import { Container } from "@/components/ui/Container";
import { getPageBySlug } from "@/lib/directus/content";
import { absoluteUrl } from "@/lib/seo/url";
import { buildBreadcrumbSchema } from "@/lib/seo/schema";

type Props = {
  searchParams?: Promise<{ mode?: string | string[] }>;
};

function normalizeMode(value: string | string[] | undefined): PartsRequestMode {
  const mode = Array.isArray(value) ? value[0] : value;
  return mode === "excel" || mode === "photo" ? mode : "list";
}

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("parts-request").catch(() => null);
  return page
    ? {
        title: page.seoTitle ?? page.title,
        description: page.seoDescription,
        alternates: { canonical: "/parts-request" },
        robots: { index: false, follow: true },
      }
    : {};
}

export default async function PartsRequestPage({ searchParams }: Props) {
  const [page, query] = await Promise.all([
    getPageBySlug("parts-request"),
    searchParams ?? Promise.resolve<{ mode?: string | string[] }>({}),
  ]);
  const section = page?.sections.find((item) => item.type === "parts_request");
  if (!page || !section) notFound();

  const mode = normalizeMode(query.mode);
  const url = absoluteUrl("/parts-request");

  return (
    <main className="parts-request-page" id="main-content">
      <JsonLdSchema
        data={buildBreadcrumbSchema([
          { name: "Главная", url: absoluteUrl("/") },
          { name: page.h1, url },
        ])}
      />
      <div className="parts-request-page__heading">
        <Container>
          <Breadcrumbs
            items={[{ label: "Главная", href: "/" }, { label: page.h1 }]}
          />
          <h1>{page.h1}</h1>
          {page.seoDescription ? <p>{page.seoDescription}</p> : null}
        </Container>
      </div>
      <HomePartsRequest initialMode={mode} section={section} />
    </main>
  );
}
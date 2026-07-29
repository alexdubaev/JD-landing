import { HomeBenefits } from "@/components/sections/HomeBenefits";
import { HomeCategories } from "@/components/sections/HomeCategories";
import {
  HomeContacts,
  HomeCta,
  HomeFaq,
  HomeLeadForm,
  HomeSeoText,
} from "@/components/sections/HomeContentSections";
import { HomeFeatured } from "@/components/sections/HomeFeatured";
import { HomeHero } from "@/components/sections/HomeHero";
import { HomeSelection } from "@/components/sections/HomeSelection";
import type { Category, ProductCardData } from "@/types/catalog";
import type {
  ContentPage,
  FaqItem,
  PageSection,
  SiteSettings,
} from "@/types/content";

function SectionRenderer({
  categories,
  faq,
  page,
  products,
  section,
  settings,
  benefitsSection,
}: {
  categories: Category[];
  faq: FaqItem[];
  page: ContentPage;
  products: ProductCardData[];
  section: PageSection;
  settings: SiteSettings;
  benefitsSection: PageSection | null;
}) {
  switch (section.type) {
    case "hero":
      return (
        <HomeHero
          benefitsSection={benefitsSection}
          h1={page.h1}
          products={products}
          section={section}
        />
      );
    case "advantages":
      return <HomeBenefits section={section} />;
    case "categories":
      return <HomeCategories categories={categories} section={section} />;
    case "featured_products":
      return <HomeFeatured products={products} section={section} />;
    case "process":
      return <HomeSelection section={section} />;
    case "cta":
      return <HomeCta section={section} />;
    case "seo_text":
      return <HomeSeoText pageText={page.seoText} section={section} />;
    case "faq":
      return <HomeFaq faq={faq} section={section} />;
    case "contacts":
      return <HomeContacts section={section} settings={settings} />;
    case "lead_form":
      return <HomeLeadForm section={section} />;
  }
}

export function HomePageView({
  categories,
  faq,
  page,
  products,
  settings,
}: {
  categories: Category[];
  faq: FaqItem[];
  page: ContentPage;
  products: ProductCardData[];
  settings: SiteSettings;
}) {
  const heroSection = page.sections.find((section) => section.type === "hero");
  const benefitsSection =
    page.sections.find((section) => section.type === "advantages") ?? null;

  return (
    <main className="home-page" id="main-content">
      {page.sections.map((section) =>
        heroSection && section.type === "advantages" ? null : (
          <SectionRenderer
            benefitsSection={benefitsSection}
            categories={categories}
            faq={faq}
            key={section.id}
            page={page}
            products={products}
            section={section}
            settings={settings}
          />
        ),
      )}
    </main>
  );
}

import { HomeArticles } from "@/components/sections/HomeArticles";
import { HomeCategories } from "@/components/sections/HomeCategories";
import { HomeContactHub } from "@/components/sections/HomeContactHub";
import { HomeCompanyTrust } from "@/components/sections/HomeCompanyTrust";
import { HomeRecentSupplies } from "@/components/sections/HomeRecentSupplies";
import { HomeFaq } from "@/components/sections/HomeContentSections";
import { HomeFeatured } from "@/components/sections/HomeFeatured";
import { HomeHero } from "@/components/sections/HomeHero";
import { HomeSelection } from "@/components/sections/HomeSelection";
import type {
  ArticleCardData,
  Category,
  ProductCardData,
} from "@/types/catalog";
import type {
  ContactChannel,
  ContentPage,
  FaqItem,
  RecentSupply,
  SectionType,
  SiteSettings,
} from "@/types/content";

export function HomePageView({
  articles,
  categories,
  contacts,
  faq,
  page,
  products,
  supplies,
  settings,
}: {
  articles: ArticleCardData[];
  categories: Category[];
  contacts: ContactChannel[];
  faq: FaqItem[];
  page: ContentPage;
  products: ProductCardData[];
  supplies: RecentSupply[];
  settings: SiteSettings;
}) {
  const find = (type: SectionType) =>
    page.sections.find((section) => section.type === type);
  const hero = find("hero");
  if (!hero) throw new Error("Homepage hero section is required");
  const supportingTypes = new Set<SectionType>([
    "hero", "advantages", "cta", "lead_form", "seo_text", "parts_request",
  ]);
  const primarySections = page.sections
    .filter((section) => !supportingTypes.has(section.type))
    .toSorted((left, right) => left.sortOrder - right.sortOrder);

  const renderSection = (section: (typeof primarySections)[number]) => {
    switch (section.type) {
      case "categories":
        return <HomeCategories categories={categories} key={section.id} section={section} />;
      case "featured_products":
        return <HomeFeatured key={section.id} products={products.slice(0, 5)} section={section} />;
      case "process":
        return <HomeSelection ctaSection={find("cta")} key={section.id} section={section} />;
      case "company_trust":
        return <HomeCompanyTrust key={section.id} section={section} settings={settings} />;
      case "recent_supplies":
        return <HomeRecentSupplies key={section.id} section={section} supplies={supplies} />;
      case "articles":
        return <HomeArticles articles={articles.slice(0, 3)} key={section.id} section={section} />;
      case "faq":
        return <HomeFaq faq={faq} key={section.id} section={section} />;
      case "contacts":
        return (
          <HomeContactHub
            contactSection={section}
            contacts={contacts}
            formSection={find("lead_form")}
            key={section.id}
            settings={settings}
          />
        );
      default:
        return null;
    }
  };

  return (
    <main className="home-page" id="main-content">
      <HomeHero
        benefitsSection={find("advantages") ?? null}
        contacts={contacts}
        section={hero}
        settings={settings}
      />
      {primarySections.map(renderSection)}
    </main>
  );
}

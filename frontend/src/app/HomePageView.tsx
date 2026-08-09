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
  PageSection,
  RecentSupply,
  SectionType,
  SiteSettings,
} from "@/types/content";

const fallbackSection = (
  type: SectionType,
  title: string,
  sortOrder: number,
): PageSection => ({
  id: `fallback-${type}`,
  type,
  title,
  subtitle: null,
  text: null,
  imageId: null,
  buttonText: null,
  buttonUrl: null,
  items: [],
  settings: {},
  sortOrder,
});

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
  const hero = find("hero") ?? fallbackSection("hero", page.h1, 0);
  const categoriesSection =
    find("categories") ?? fallbackSection("categories", "Категории продукции", 1);
  const featured =
    find("featured_products") ??
    fallbackSection("featured_products", "Избранные товары", 2);
  const process =
    find("process") ?? fallbackSection("process", "Как происходит подбор", 3);
  const articleSection =
    find("articles") ?? fallbackSection("articles", "Практические статьи", 4);
  const faqSection =
    find("faq") ?? fallbackSection("faq", "Вопросы и ответы", 5);

  return (
    <main className="home-page" id="main-content">
      <HomeHero
        benefitsSection={find("advantages") ?? null}
        contacts={contacts}
        h1={page.h1}
        section={hero}
        settings={settings}
      />
      <HomeCategories categories={categories} section={categoriesSection} />
      <HomeFeatured products={products.slice(0, 5)} section={featured} />
      <HomeSelection ctaSection={find("cta")} section={process} />
      {find("company_trust") ? <HomeCompanyTrust section={find("company_trust")!} settings={settings} /> : null}
      {find("recent_supplies") ? <HomeRecentSupplies section={find("recent_supplies")!} supplies={supplies} /> : null}
      <HomeArticles articles={articles.slice(0, 3)} section={articleSection} />
      <HomeFaq faq={faq} section={faqSection} />
      <HomeContactHub
        contactSection={find("contacts")}
        contacts={contacts}
        formSection={find("lead_form")}
        settings={settings}
      />
    </main>
  );
}

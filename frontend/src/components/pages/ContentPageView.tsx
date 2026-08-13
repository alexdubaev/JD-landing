import { LeadForm } from "@/components/forms/LeadForm";
import { Reveal } from "@/components/motion/Reveal";
import {
  HomeContacts,
  HomeCta,
  HomeFaq,
} from "@/components/sections/HomeContentSections";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { Container } from "@/components/ui/Container";
import { BRAND_NAME } from "@/lib/brand";
import type {
  ContentPage,
  FaqItem,
  PageSection,
  SiteSettings,
} from "@/types/content";

function ContentSection({ section }: { section: PageSection }) {
  return (
    <section className="content-page__section">
      <Reveal>
        {section.subtitle ? <p className="section-eyebrow">{section.subtitle}</p> : null}
        {section.title ? <h2>{section.title}</h2> : null}
        {section.text ? <p>{section.text}</p> : null}
      </Reveal>
    </section>
  );
}

export function ContentPageView({
  faq,
  page,
  settings,
}: {
  faq: FaqItem[];
  page: ContentPage;
  settings: SiteSettings;
}) {
  return (
    <main className="content-page" id="main-content">
      <Container>
        <Breadcrumbs
          items={[{ href: "/", label: "Главная" }, { label: page.title }]}
        />
        <Reveal className="content-page__heading">
          <p className="section-eyebrow">{BRAND_NAME}</p>
          <h1>{page.h1}</h1>
        </Reveal>
        {page.sections.map((section) => {
          switch (section.type) {
            case "cta":
              return <HomeCta key={section.id} section={section} />;
            case "faq":
              return (
                <HomeFaq faq={faq} key={section.id} section={section} />
              );
            case "contacts":
              return (
                <HomeContacts
                  key={section.id}
                  section={section}
                  settings={settings}
                />
              );
            case "lead_form":
              return (
                <section
                  className="content-page__section"
                  id="consultation"
                  key={section.id}
                >
                  <h2>{section.title ?? "Заявка на консультацию"}</h2>
                  {section.text ? <p>{section.text}</p> : null}
                  <LeadForm />
                </section>
              );
            case "seo_text":
              return <ContentSection key={section.id} section={section} />;
            default:
              return <ContentSection key={section.id} section={section} />;
          }
        })}
        {!page.sections.length && page.seoText ? (
          <section className="content-page__section">
            <p>{page.seoText}</p>
          </section>
        ) : null}
      </Container>
    </main>
  );
}

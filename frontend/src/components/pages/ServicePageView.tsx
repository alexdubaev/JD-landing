import Image from "next/image";
import Link from "next/link";

import { LeadForm } from "@/components/forms/LeadForm";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { ContactChannelLink } from "@/components/sections/HomeContactActions";
import { AnimatedAccordion } from "@/components/ui/AnimatedAccordion";
import { Container } from "@/components/ui/Container";
import { FRONTEND_CONTACT_EMAIL, uniqueContactPhones } from "@/lib/contact-config";
import { directusAssetUrl } from "@/lib/directus/assets";
import { telHref } from "@/lib/format/tel";
import type { ContentPage, FaqItem, PageSection, SiteSettings } from "@/types/content";

type Props = {
  faq: FaqItem[];
  page: ContentPage;
  settings: SiteSettings;
};

const paragraphs = (text: string | null) =>
  text
    ?.split(/\n\s*\n/gu)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean) ?? [];

const stringItems = (section: PageSection) =>
  section.items.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0,
  );

const hasValue = (value: string | null): value is string => Boolean(value?.trim());

function ServiceTextSection({ section }: { section: PageSection }) {
  const items = stringItems(section);

  return (
    <section className="service-page__section" id={section.id}>
      {section.subtitle ? <p className="section-eyebrow">{section.subtitle}</p> : null}
      {section.title ? <h2>{section.title}</h2> : null}
      {paragraphs(section.text).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {items.length ? (
        <ul className="service-page__list">
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : null}
    </section>
  );
}

function ServiceHero({ page }: { page: ContentPage }) {
  const lead = page.sections.find((section) => section.id.endsWith("-lead"));

  return (
    <header className="service-page__hero">
      <p className="section-eyebrow">{page.title}</p>
      <h1>{page.h1}</h1>
      {paragraphs(lead?.text ?? null).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    </header>
  );
}

function DeliveryRoute({ section }: { section: PageSection | undefined }) {
  const stages = section ? stringItems(section) : [];
  if (!stages.length) return null;

  return (
    <section aria-label="Маршрут заказа" className="service-page__route">
      <p className="section-eyebrow">Маршрут заказа</p>
      <ol>
        {stages.map((stage, index) => (
          <li key={stage}>
            <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <p>{stage}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CompanyFactPanel({ settings }: { settings: SiteSettings }) {
  const facts = [
    hasValue(settings.legalName) ? ["Юридическое лицо", settings.legalName] : null,
    hasValue(settings.inn) ? ["ИНН", settings.inn] : null,
    hasValue(settings.kpp) ? ["КПП", settings.kpp] : null,
    hasValue(settings.ogrn) ? ["ОГРН", settings.ogrn] : null,
    hasValue(settings.legalAddress) ? ["Юридический адрес", settings.legalAddress] : null,
    hasValue(settings.vatInfo) ? ["НДС", settings.vatInfo] : null,
  ].filter((fact): fact is [string, string] => fact !== null);

  return (
    <aside className="service-page__company-facts" aria-label="Сведения о компании">
      <p className="section-eyebrow">Сведения о компании</p>
      <dl>
        <div>
          <dt>Компания</dt>
          <dd>{settings.companyName}</dd>
        </div>
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {settings.requisitesUrl || settings.documentsUrl ? (
        <p className="service-page__fact-links">
          {settings.requisitesUrl ? <Link href={settings.requisitesUrl}>Реквизиты</Link> : null}
          {settings.documentsUrl ? <Link href={settings.documentsUrl}>Документы</Link> : null}
        </p>
      ) : null}
    </aside>
  );
}

function AboutCompanyPanel({ settings }: { settings: SiteSettings }) {
  const imageUrl = directusAssetUrl(settings.companyImageId, {
    width: 960,
    height: 640,
    fit: "cover",
    quality: 88,
    format: "webp",
  });

  if (!imageUrl) return <CompanyFactPanel settings={settings} />;

  return (
    <div className="service-page__company-media">
      <Image
        alt={settings.companyName}
        fill
        sizes="(max-width: 48rem) 100vw, 45vw"
        src={imageUrl}
      />
    </div>
  );
}

function ContactPanel({ settings }: { settings: SiteSettings }) {
  const phoneChannels = uniqueContactPhones(settings.phone).map((value, index) => ({
    id: `service-phone-${index}`,
    type: "phone",
    label: "Телефон",
    value,
    url: `tel:${telHref(value)}`,
    icon: null,
  }));
  const email = settings.email?.trim() || FRONTEND_CONTACT_EMAIL;

  return (
    <section className="service-page__contacts" aria-label="Контактные данные">
      <div>
        {phoneChannels.map((channel) => (
          <p key={channel.id}>
            <span>Телефон</span>
            <ContactChannelLink channel={channel} />
          </p>
        ))}
        <p>
          <span>Email</span>
          <ContactChannelLink
            channel={{ id: "service-email", type: "email", label: "Email", value: email, url: `mailto:${email}`, icon: null }}
          />
        </p>
        {hasValue(settings.workingHours) ? <p><span>Режим работы</span>{settings.workingHours}</p> : null}
        {hasValue(settings.address) ? <p><span>Адрес</span>{settings.address}</p> : null}
      </div>
      <div className="service-page__contact-actions">
        {phoneChannels[0] ? <ContactChannelLink channel={phoneChannels[0]} /> : null}
        <ContactChannelLink
          channel={{ id: "service-email-action", type: "email", label: "Email", value: "Написать", url: `mailto:${email}`, icon: null }}
        />
      </div>
    </section>
  );
}

function ServiceCta({ section }: { section: PageSection }) {
  return (
    <section className="service-page__cta" id={section.id}>
      {section.title ? <h2>{section.title}</h2> : null}
      {paragraphs(section.text).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.buttonText && section.buttonUrl ? (
        <Link className="button button--accent" href={section.buttonUrl}>{section.buttonText}</Link>
      ) : null}
    </section>
  );
}

export function ServicePageView({ faq, page, settings }: Props) {
  const lead = page.sections.find((section) => section.id.endsWith("-lead"));
  const cta = page.sections.find((section) => section.type === "cta");
  const faqSection = page.sections.find((section) => section.type === "faq");
  const leadFormSection = page.sections.find((section) => section.type === "lead_form");
  const route = page.sections.find((section) => section.id === "delivery-order");
  const contactRequest = page.sections.find((section) => section.id === "contacts-request");
  const contentSections = page.sections.filter((section) =>
    section !== lead &&
    section !== cta &&
    section !== faqSection &&
    section !== leadFormSection &&
    section !== route &&
    section.type !== "contacts",
  );

  return (
    <main className={`service-page service-page--${page.slug}`} id="main-content">
      <Container>
        <Breadcrumbs items={[{ href: "/", label: "Главная" }, { label: page.title }]} />
        <ServiceHero page={page} />

        {page.slug === "delivery" ? <DeliveryRoute section={route} /> : null}
        {page.slug === "contacts" ? <ContactPanel settings={settings} /> : null}
        {page.slug === "about" ? <AboutCompanyPanel settings={settings} /> : null}

        {page.slug === "contacts" && contactRequest ? (
          <ServiceTextSection section={contactRequest} />
        ) : null}

        {contentSections.length ? (
          <div className="service-page__sections">
            {contentSections
              .filter((section) => section !== contactRequest)
              .map((section) => <ServiceTextSection key={section.id} section={section} />)}
          </div>
        ) : null}

        {faqSection && faq.length ? (
          <section className="service-page__faq" id={faqSection.id}>
            {faqSection.title ? <h2>{faqSection.title}</h2> : null}
            {faqSection.text ? <p>{faqSection.text}</p> : null}
            <AnimatedAccordion items={faq} />
          </section>
        ) : null}

        {leadFormSection ? (
          <section className="service-page__form" id="consultation">
            {leadFormSection.title ? <h2>{leadFormSection.title}</h2> : null}
            {paragraphs(leadFormSection.text).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            <LeadForm />
          </section>
        ) : null}

        {cta ? <ServiceCta section={cta} /> : null}
      </Container>
    </main>
  );
}

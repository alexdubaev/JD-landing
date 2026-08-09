import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { LeadForm } from "@/components/forms/LeadForm";
import { Reveal } from "@/components/motion/Reveal";
import { AnimatedAccordion } from "@/components/ui/AnimatedAccordion";
import { Container } from "@/components/ui/Container";
import type { FaqItem, PageSection, SiteSettings } from "@/types/content";

export function HomeCta({ section }: { section: PageSection }) {
  return (
    <section className="home-cta">
      <span aria-hidden="true" className="home-cta__orb" />
      <Container>
        <Reveal className="home-cta__inner" direction="left">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Нужна помощь с подбором?"}</h2>
            {section.text ? <p>{section.text}</p> : null}
          </div>
          {section.buttonText && section.buttonUrl ? (
            <Link className="button button--accent" href={section.buttonUrl}>
              {section.buttonText}
              <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </Reveal>
      </Container>
    </section>
  );
}

export function HomeSeoText({
  pageText,
  section,
}: {
  pageText: string | null;
  section: PageSection;
}) {
  const text = section.text ?? pageText;
  if (!text) return null;

  return (
    <section className="home-section home-seo">
      <Container>
        <Reveal>
          <h2>{section.title ?? "Подбор комплектующих John Deere"}</h2>
          <p>{text}</p>
        </Reveal>
      </Container>
    </section>
  );
}

export function HomeFaq({
  faq,
  section,
}: {
  faq: FaqItem[];
  section: PageSection;
}) {
  if (!faq.length) return null;

  return (
    <section className="home-section home-faq">
      <Container>
        <Reveal className="home-faq__heading">
          {section.subtitle ? <p>{section.subtitle}</p> : null}
          <h2>{section.title ?? "Вопросы и ответы"}</h2>
          {section.text ? <p>{section.text}</p> : null}
        </Reveal>
        <AnimatedAccordion items={faq} />
      </Container>
    </section>
  );
}

const phoneHref = (phone: string) => phone.replace(/[^\d+]/gu, "");

export function HomeContacts({
  section,
  settings,
}: {
  section: PageSection;
  settings: SiteSettings;
}) {
  return (
    <section className="home-section home-contacts">
      <Container>
        <Reveal className="home-contacts__grid">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Свяжитесь с нами"}</h2>
            {section.text ? <p>{section.text}</p> : null}
          </div>
          <address>
            {settings.phone ? (
              <a href={`tel:${phoneHref(settings.phone)}`}>
                <Phone aria-hidden="true" />
                {settings.phone}
              </a>
            ) : null}
            {settings.email ? (
              <Link href="/parts-request">
                <Mail aria-hidden="true" />
                Написать нам
              </Link>
            ) : null}
            {settings.address ? (
              <span>
                <MapPin aria-hidden="true" />
                {settings.address}
              </span>
            ) : null}
          </address>
        </Reveal>
      </Container>
    </section>
  );
}

export function HomeLeadForm({ section }: { section: PageSection }) {
  return (
    <section className="home-section home-lead" id="consultation">
      <Container>
        <Reveal className="home-lead__grid">
          <div>
            {section.subtitle ? <p>{section.subtitle}</p> : null}
            <h2>{section.title ?? "Оставьте заявку на подбор"}</h2>
            <p>
              {section.text ??
                "Укажите контакты и задачу — менеджер уточнит совместимость и условия поставки."}
            </p>
          </div>
          <LeadForm />
        </Reveal>
      </Container>
    </section>
  );
}

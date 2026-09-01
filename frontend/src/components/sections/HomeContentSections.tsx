import { ArrowRight, Mail, MapPin, Phone } from "lucide-react";
import Link from "next/link";

import { Reveal } from "@/components/motion/Reveal";
import { AnimatedAccordion } from "@/components/ui/AnimatedAccordion";
import { Container } from "@/components/ui/Container";
import { FRONTEND_CONTACT_EMAIL, uniqueContactPhones } from "@/lib/contact-config";
import { telHref } from "@/lib/format/tel";
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
            {uniqueContactPhones(settings.phone).map((phone) => (
              <a href={`tel:${telHref(phone)}`} key={phone}>
                <Phone aria-hidden="true" />
                {phone}
              </a>
            ))}
            <a href={`mailto:${FRONTEND_CONTACT_EMAIL}`}>
                <Mail aria-hidden="true" />
                {FRONTEND_CONTACT_EMAIL}
            </a>
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

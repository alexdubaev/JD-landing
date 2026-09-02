import Image from "next/image";
import Link from "next/link";

import { ContactChannelLink } from "@/components/sections/HomeContactActions";
import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { PageSection, SiteSettings } from "@/types/content";

const hasValue = (value: string | null): value is string => Boolean(value?.trim());

export function HomeCompanyTrust({ section, settings }: { section: PageSection; settings: SiteSettings }) {
  const facts = [
    hasValue(settings.legalName)
      ? { id: "legal-name", label: "Юридическое лицо", value: settings.legalName }
      : null,
    hasValue(settings.inn)
      ? { id: "inn", label: "ИНН", value: `ИНН ${settings.inn}` }
      : null,
    hasValue(settings.vatInfo)
      ? { id: "vat", label: "НДС", value: settings.vatInfo }
      : null,
  ].filter((fact): fact is { id: string; label: string; value: string } => fact !== null);

  const hasCompanyProof = Boolean(
    settings.legalName ||
      settings.inn ||
      settings.requisitesUrl ||
      settings.documentsUrl,
  );
  if (!hasCompanyProof) return null;

  const imageUrl = directusAssetUrl(settings.companyImageId, {
    width: 960,
    height: 640,
    fit: "cover",
    quality: 88,
    format: "webp",
  });

  return (
    <section className="home-section home-company-trust" id="company">
      <Container className="home-company-trust__grid">
        <div className="home-company-trust__details">
          {section.subtitle ? <p>{section.subtitle}</p> : null}
          {section.title ? <h2>{section.title}</h2> : null}
          {section.text ? <p>{section.text}</p> : null}
          {facts.length || settings.phone || settings.workingHours ? (
            <dl className="home-company-trust__facts">
              {facts.map((fact) => (
                <div key={fact.id}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
              {hasValue(settings.phone) || hasValue(settings.workingHours) ? (
                <div>
                  <dt>Связь</dt>
                  <dd>
                    {hasValue(settings.phone) ? (
                      <ContactChannelLink channel={{ id: "company-phone", type: "phone", label: "Телефон", value: settings.phone, url: null, icon: null }} />
                    ) : null}
                    {hasValue(settings.workingHours) ? <span>{settings.workingHours}</span> : null}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          {settings.requisitesUrl || settings.documentsUrl ? (
            <div className="home-company-trust__links">
              {settings.requisitesUrl ? (
                <Link href={settings.requisitesUrl}>Реквизиты</Link>
              ) : null}
              {settings.documentsUrl ? (
                <Link href={settings.documentsUrl}>Документы</Link>
              ) : null}
            </div>
          ) : null}
        </div>
        {imageUrl ? (
          <div className="home-company-trust__media">
            <Image
              alt={section.imageAlt?.trim() || section.title?.trim() || settings.companyName}
              fill
              loading="lazy"
              sizes="(max-width: 768px) 100vw, 45vw"
              src={imageUrl}
            />
          </div>
        ) : null}
      </Container>
    </section>
  );
}

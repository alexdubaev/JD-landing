import Image from "next/image";
import Link from "next/link";

import { ContactChannelLink } from "@/components/sections/HomeContactActions";
import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { PageSection, SiteSettings } from "@/types/content";

const hasValue = (value: string | null) => Boolean(value?.trim());

export function HomeCompanyTrust({ section, settings }: { section: PageSection; settings: SiteSettings }) {
  const details = [
    settings.legalName,
    settings.inn ? `ИНН ${settings.inn}` : null,
    settings.kpp ? `КПП ${settings.kpp}` : null,
    settings.ogrn ? `ОГРН ${settings.ogrn}` : null,
    settings.legalAddress,
    settings.city,
    settings.vatInfo,
  ].filter(hasValue);

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
          {details.length ? (
            <dl>
              {details.map((detail) => (
                <div key={detail}>
                  <dd>{detail}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          {settings.phone || settings.email || settings.workingHours ? (
            <div className="home-company-trust__contacts">
              {settings.phone ? <ContactChannelLink channel={{ id: "company-phone", type: "phone", label: "Телефон", value: settings.phone, url: null, icon: null }} /> : null}
              {settings.email ? <Link href="/parts-request">Написать нам</Link> : null}
              {settings.workingHours ? <span>{settings.workingHours}</span> : null}
            </div>
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
              alt="Компания DEERE-SHOP"
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

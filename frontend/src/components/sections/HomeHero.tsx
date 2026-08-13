import {
  ClipboardCheck,
  FileText,
  Headset,
  PackageCheck,
  Search,
  ShieldCheck,
  Truck,
  MessageCircle,
  Phone,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HeroMotion } from "@/components/motion/HeroMotion";
import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { ContactChannel, PageSection, SiteSettings } from "@/types/content";

import { HeroPartSearch } from "./HeroPartSearch";

const iconByName = {
  clipboard: ClipboardCheck,
  file: FileText,
  headset: Headset,
  headphones: Headset,
  package: PackageCheck,
  search: Search,
  shield: ShieldCheck,
  truck: Truck,
} as const;

type BenefitItem = {
  icon?: keyof typeof iconByName;
  text: string;
  title: string;
};

const isBenefit = (value: unknown): value is BenefitItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BenefitItem>;
  return typeof item.title === "string" && typeof item.text === "string";
};

const settingText = (section: PageSection, key: string) => {
  const value = section.settings[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Homepage hero setting is required: ${key}`);
  }
  return value.trim();
};

const optionalSettingText = (section: PageSection, key: string) => {
  const value = section.settings[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

function HeroTitle({ title }: { title: string }) {
  const match = title.match(/john deere/iu);
  if (!match || match.index === undefined) return <>{title}</>;

  const before = title.slice(0, match.index);
  const after = title.slice(match.index + match[0].length);
  return (
    <>
      {before}
      <span>John Deere</span>
      {after}
    </>
  );
}

export function HomeHero({
  benefitsSection,
  contacts,
  section,
  settings,
}: {
  benefitsSection?: PageSection | null;
  contacts: ContactChannel[];
  section: PageSection;
  settings: SiteSettings;
}) {
  const benefits = (benefitsSection?.items ?? []).filter(isBenefit).slice(0, 4);
  const title = section.title?.trim();
  const description = section.text?.trim();
  const imageAlt = section.imageAlt?.trim();
  const imageUrl = directusAssetUrl(section.imageId, {
    format: "webp",
    quality: 84,
    width: 1920,
  });
  if (!title || !description || !imageUrl || !imageAlt) {
    throw new Error("Homepage hero content is incomplete");
  }

  const phone = contacts.find((channel) => channel.type === "phone")?.value ?? settings.phone;
  const messengers = contacts
    .filter((channel) => ["telegram", "whatsapp", "messenger"].includes(channel.type))
    .filter((channel) => channel.url)
    .slice(0, 2);
  const primaryCta = section.buttonText?.trim() && section.buttonUrl?.trim()
    ? { text: section.buttonText.trim(), url: section.buttonUrl.trim() }
    : null;
  const secondaryText = optionalSettingText(section, "secondary_cta_text");
  const secondaryUrl = optionalSettingText(section, "secondary_cta_url");
  const secondaryCta = secondaryText && secondaryUrl
    ? { text: secondaryText, url: secondaryUrl }
    : null;

  return (
    <HeroMotion
      labelledBy="home-title"
      media={(
        <div className="commerce-hero__assembly">
          <Image
            alt={imageAlt}
            className="commerce-hero__image"
            fill
            priority
            sizes="(max-width: 68rem) 0px, 46vw"
            src={imageUrl}
          />
        </div>
      )}
    >
      <Container className="commerce-hero__content">
        <Reveal className="commerce-hero__copy">
          <h1 id="home-title"><HeroTitle title={title} /></h1>
          <p className="commerce-hero__description">{description}</p>
          <HeroPartSearch
            bulkLink={{
              text: settingText(section, "bulk_link_text"),
              url: settingText(section, "bulk_link_url"),
            }}
            bulkPrompt={settingText(section, "bulk_prompt")}
            buttonText={settingText(section, "search_button_text")}
            excelLink={{
              text: settingText(section, "excel_link_text"),
              url: settingText(section, "excel_link_url"),
            }}
            label={settingText(section, "search_label")}
            photoLink={{
              text: settingText(section, "photo_link_text"),
              url: settingText(section, "photo_link_url"),
            }}
            placeholder={settingText(section, "search_placeholder")}
          />
          <div className="commerce-hero__contacts commerce-hero__contacts--desktop-only">
            {phone ? (
              <a href={`tel:${phone.replace(/[^\d+]/gu, "")}`}>
                <Phone aria-hidden="true" />
                {phone}
              </a>
            ) : null}
            {messengers.map((channel) => (
              <a href={channel.url!} key={channel.id}>
                <MessageCircle aria-hidden="true" />
                {channel.label}
              </a>
            ))}
            {primaryCta ? <Link href={primaryCta.url}>{primaryCta.text}</Link> : null}
            {secondaryCta ? <Link href={secondaryCta.url}>{secondaryCta.text}</Link> : null}
          </div>
        </Reveal>
      </Container>

      {benefits.length ? (
        <Container className="commerce-hero__benefits">
          <div className="commerce-hero__benefits-grid">
            {benefits.map(({ icon = "package", text, title: benefitTitle }) => {
              const Icon = iconByName[icon] ?? PackageCheck;
              return (
                <div className="commerce-hero__benefit" key={benefitTitle}>
                  <Icon aria-hidden="true" />
                  <div>
                    <strong>{benefitTitle}</strong>
                    <span>{text}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Container>
      ) : null}
    </HeroMotion>
  );
}

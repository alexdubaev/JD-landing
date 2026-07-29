import {
  ClipboardCheck,
  FileText,
  Headset,
  PackageCheck,
  Search,
  ShieldCheck,
  Truck,
} from "lucide-react";
import Image from "next/image";

import { HeroMotion } from "@/components/motion/HeroMotion";
import { Reveal } from "@/components/motion/Reveal";
import { Container } from "@/components/ui/Container";
import { BRAND_DISCLAIMER } from "@/lib/brand";
import { directusAssetUrl } from "@/lib/directus/assets";
import type { ProductCardData } from "@/types/catalog";
import type { PageSection } from "@/types/content";

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

const settingString = (
  settings: Record<string, unknown>,
  key: string,
): string | null => {
  const value = settings[key];
  return typeof value === "string" && value.trim() ? value : null;
};

const isBenefit = (value: unknown): value is BenefitItem => {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<BenefitItem>;
  return typeof item.title === "string" && typeof item.text === "string";
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
  h1,
  products,
  section,
}: {
  benefitsSection?: PageSection | null;
  h1: string;
  products: ProductCardData[];
  section: PageSection;
}) {
  const imageUrl = section.imageId
    ? (directusAssetUrl(section.imageId, {
        width: 1920,
        height: 1280,
        fit: "cover",
        quality: 88,
        format: "webp",
      }) ?? "/images/home/deere-shop-hero.png")
    : "/images/home/deere-shop-hero.png";
  const benefits = (benefitsSection?.items ?? []).filter(isBenefit).slice(0, 4);

  return (
    <HeroMotion
      labelledBy="home-title"
      media={
        <Image
          alt={
            settingString(section.settings, "image_alt") ??
            "Трактор John Deere в поле"
          }
          className="commerce-hero__image"
          fill
          priority
          sizes="100vw"
          src={imageUrl}
        />
      }
    >
      <div className="commerce-hero__veil" />
      <Container className="commerce-hero__content">
        <Reveal className="commerce-hero__copy">
          {section.subtitle ? (
            <p className="commerce-hero__eyebrow">{section.subtitle}</p>
          ) : null}
          <h1 id="home-title">
            <HeroTitle title={section.title ?? h1} />
          </h1>
          {section.text ? (
            <p className="commerce-hero__description">{section.text}</p>
          ) : null}
          <HeroPartSearch products={products} />
          <small>
            {settingString(section.settings, "disclaimer") ?? BRAND_DISCLAIMER}
          </small>
        </Reveal>
      </Container>

      {benefits.length ? (
        <Container className="commerce-hero__benefits">
          <div className="commerce-hero__benefits-grid">
            {benefits.map(({ icon = "package", text, title }) => {
              const Icon = iconByName[icon] ?? PackageCheck;
              return (
                <div className="commerce-hero__benefit" key={title}>
                  <Icon aria-hidden="true" />
                  <div>
                    <strong>{title}</strong>
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

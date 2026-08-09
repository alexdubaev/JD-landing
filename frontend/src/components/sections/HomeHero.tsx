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

const HERO_TITLE = "Запчасти John Deere с подбором и доставкой по России";
const HERO_SUBTITLE =
  "Найдём нужную деталь по артикулу, модели техники или фотографии маркировки";

const DEFAULT_BENEFITS: BenefitItem[] = [
  {
    icon: "shield",
    title: "Гарантия качества",
    text: "Проверяем товары и согласовываем условия поставки.",
  },
  {
    icon: "package",
    title: "Собственные склады",
    text: "Уточняем наличие на собственных и партнёрских складах.",
  },
  {
    icon: "truck",
    title: "Быстрая доставка",
    text: "Подбираем удобный способ отправки по России.",
  },
  {
    icon: "headset",
    title: "Поддержка 24/7",
    text: "Поможем с подбором и ответим на вопросы.",
  },
];

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
  h1,
  section,
  settings,
}: {
  benefitsSection?: PageSection | null;
  contacts: ContactChannel[];
  h1: string;
  section: PageSection;
  settings: SiteSettings;
}) {
  const imageUrl = section.imageId
    ? (directusAssetUrl(section.imageId, {
        width: 1920,
        height: 1280,
        fit: "cover",
        quality: 88,
        format: "webp",
      }) ?? "/images/home/deere-shop-hero.webp")
    : "/images/home/deere-shop-hero.webp";
  const configuredBenefits = (benefitsSection?.items ?? []).filter(isBenefit);
  const benefits = configuredBenefits.length >= DEFAULT_BENEFITS.length
    ? configuredBenefits.slice(0, 4)
    : DEFAULT_BENEFITS;
  const title = section.title?.trim() || HERO_TITLE;
  const description = section.text?.trim() || HERO_SUBTITLE;
  const phone =
    contacts.find((channel) => channel.type === "phone")?.value ?? settings.phone;
  const messengers = contacts
    .filter((channel) => ["telegram", "whatsapp", "messenger"].includes(channel.type))
    .filter((channel) => channel.url)
    .slice(0, 2);

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
      <Container className="commerce-hero__content">
        <Reveal className="commerce-hero__copy">
          <h1 id="home-title">
            <HeroTitle title={title || h1} />
          </h1>
          <p className="commerce-hero__description">{description}</p>
          <HeroPartSearch />
          <div className="commerce-hero__contacts">
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
            <Link href="#consultation">Отправить запрос</Link>
          </div>
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

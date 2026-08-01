import { Headphones } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { BRAND_LOGO_PATH, BRAND_NAME } from "@/lib/brand";
import { directusAssetUrl } from "@/lib/directus/assets";

import { HeaderChrome } from "./HeaderChrome";
import { HeaderNavigation } from "./HeaderNavigation";
import { MobileNavigation } from "./MobileNavigation";
import type { NavigationItem } from "./types";

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/gu, "");

const FALLBACK_NAVIGATION = [
  { label: "Каталог", url: "/catalog" },
  {
    label: "Доставка и оплата",
    url: "/delivery",
  },
  { label: "Компания", url: "/about" },
  { label: "Документы", url: "/documents" },
  { label: "Статьи", url: "/articles" },
  { label: "Контакты", url: "/contacts" },
] as const;

export const getHeaderNavigation = (navigation: NavigationItem[]) =>
  navigation.length ? navigation : [...FALLBACK_NAVIGATION];

export function Header({
  companyName = BRAND_NAME,
  logoId,
  navigation,
  phone,
}: {
  companyName?: string;
  email?: string | null;
  logoId?: string | null;
  navigation: NavigationItem[];
  phone?: string | null;
}) {
  const headerNavigation = getHeaderNavigation(navigation);
  const logoUrl =
    directusAssetUrl(logoId, {
      width: 720,
      fit: "contain",
      quality: 92,
      format: "webp",
    }) ?? BRAND_LOGO_PATH;

  return (
    <HeaderChrome>
      <div className="site-header__main">
        <Container className="site-header__inner">
          <Link
            aria-label={`${companyName} — на главную`}
            className="site-header__brand"
            href="/"
          >
            <Image
              alt={`${companyName} — запчасти для спецтехники`}
              className="site-header__logo"
              height={251}
              priority
              src={logoUrl}
              width={1829}
            />
          </Link>
          <HeaderNavigation navigation={headerNavigation} />
          <div className="site-header__actions">
            <Headphones aria-hidden="true" />
            {phone ? (
              <a
                className="site-header__phone"
                href={`tel:${normalizePhone(phone)}`}
              >
                {phone}
              </a>
            ) : (
              <Link className="site-header__phone" href="/contacts">
                Консультация
              </Link>
            )}
            <Link className="site-header__request" href="/parts-request">
              Отправить запрос
            </Link>
          </div>
          <MobileNavigation navigation={headerNavigation} phone={phone} />
        </Container>
      </div>
    </HeaderChrome>
  );
}

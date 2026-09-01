import { Headphones } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { BRAND_LOGO_PATH, BRAND_NAME } from "@/lib/brand";
import { directusAssetUrl } from "@/lib/directus/assets";
import { telHref } from "@/lib/format/tel";

import { CartBadge } from "./CartBadge";
import { ContactRequestDialog } from "../forms/ContactRequestDialog";
import { HeaderChrome } from "./HeaderChrome";
import { HeaderNavigation } from "./HeaderNavigation";
import { MobileNavigation } from "./MobileNavigation";
import type { NavigationItem } from "./types";


const FALLBACK_NAVIGATION = [
  { id: "fallback-catalog", label: "Каталог", url: "/catalog" },
  {
    id: "fallback-delivery",
    label: "Доставка и оплата",
    url: "/delivery",
  },
  { id: "fallback-about", label: "Компания", url: "/about" },
  { id: "fallback-articles", label: "Статьи", url: "/articles" },
  { id: "fallback-contacts", label: "Контакты", url: "/contacts" },
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
                href={`tel:${telHref(phone)}`}
              >
                {phone}
              </a>
            ) : (
              <Link className="site-header__phone" href="/contacts">
                Консультация
              </Link>
            )}
            <ContactRequestDialog />
          </div>
          <CartBadge />
          <MobileNavigation navigation={headerNavigation} phone={phone} />
        </Container>
      </div>
    </HeaderChrome>
  );
}

import { Headphones } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import { BRAND_LOGO_PATH, BRAND_NAME } from "@/lib/brand";
import { directusAssetUrl } from "@/lib/directus/assets";

import { HeaderChrome } from "./HeaderChrome";
import { MobileNavigation } from "./MobileNavigation";
import type { NavigationItem } from "./types";

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/gu, "");

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
          <nav
            aria-label="Основная навигация"
            className="site-header__navigation"
          >
            {navigation.map((item) => (
              <Link href={item.url} key={`${item.url}:${item.label}`}>
                {item.label}
              </Link>
            ))}
          </nav>
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
          </div>
          <MobileNavigation navigation={navigation} phone={phone} />
        </Container>
      </div>
    </HeaderChrome>
  );
}

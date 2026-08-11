import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";
import {
  BRAND_DESCRIPTION,
  BRAND_LOGO_PATH,
  BRAND_NAME,
} from "@/lib/brand";
import { directusAssetUrl } from "@/lib/directus/assets";
import { safeUrl } from "@/lib/security/urls";

import type { NavigationItem } from "./types";

export function Footer({
  navigation,
  phone,
  companyName = BRAND_NAME,
  footerText,
  footerDisclaimer,
  logoId,
}: {
  companyName?: string;
  navigation: NavigationItem[];
  phone?: string | null;
  footerText?: string | null;
  footerDisclaimer?: string | null;
  logoId?: string | null;
}) {
  const logoUrl =
    directusAssetUrl(logoId, {
      width: 480,
      fit: "contain",
      quality: 92,
      format: "webp",
    }) ?? BRAND_LOGO_PATH;

  return (
    <footer className="site-footer">
      <Container className="site-footer__grid">
        <div>
          <Link aria-label={`${companyName} — на главную`} href="/">
            <Image
              alt={`${companyName} — запчасти для спецтехники`}
              className="site-footer__logo"
              height={251}
              loading="eager"
              src={logoUrl}
              width={1829}
            />
          </Link>
          <p className="site-footer__note">{footerText ?? BRAND_DESCRIPTION}</p>
        </div>
        <nav aria-label="Навигация в подвале" className="site-footer__links">
          {navigation.map((item) => (
            <Link href={safeUrl(item.url, "/") ?? "/"} key={`${item.url}:${item.label}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-footer__contacts">
          <strong>Связаться с нами</strong>
          {phone ? (
            <a href={`tel:${phone.replace(/[^\d+]/gu, "")}`}>{phone}</a>
          ) : null}
          <Link href="/parts-request">Написать нам</Link>
          <Link href="/privacy-policy">Политика конфиденциальности</Link>
        </div>
      </Container>
      <Container className="site-footer__bottom">
        <span>© {new Date().getFullYear()} {companyName}</span>
        <span>{footerDisclaimer ?? "Не является заявлением об официальном представительстве."}</span>
      </Container>
    </footer>
  );
}

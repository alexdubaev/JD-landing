import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

import { MobileNavigation } from "./MobileNavigation";
import type { NavigationItem } from "./types";

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/gu, "");

export function Header({
  navigation,
  phone,
}: {
  navigation: NavigationItem[];
  phone?: string | null;
}) {
  return (
    <header className="site-header">
      <Container className="site-header__inner">
        <Link aria-label="СМ ТЕХНО — на главную" href="/">
          <Image
            alt="СМ ТЕХНО — запчасти для спецтехники"
            className="site-header__logo"
            height={346}
            priority
            src="/brand/sm-techno-logo.png"
            width={939}
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
          {phone ? (
            <a className="site-header__phone" href={`tel:${normalizePhone(phone)}`}>
              {phone}
            </a>
          ) : null}
          <Link className="site-header__request" href="/contacts#consultation">
            Оставить заявку
          </Link>
        </div>
        <MobileNavigation navigation={navigation} />
      </Container>
    </header>
  );
}

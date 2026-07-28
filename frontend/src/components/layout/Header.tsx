import { Headphones, Search } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

import { MobileNavigation } from "./MobileNavigation";
import type { NavigationItem } from "./types";

const normalizePhone = (phone: string) => phone.replace(/[^\d+]/gu, "");

export function Header({
  email,
  navigation,
  phone,
}: {
  email?: string | null;
  navigation: NavigationItem[];
  phone?: string | null;
}) {
  return (
    <header className="site-header">
      <div className="site-header__utility">
        <Container className="site-header__utility-inner">
          <span>Подбор запчастей для сельхозтехники и спецтехники</span>
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
        </Container>
      </div>
      <div className="site-header__main">
        <Container className="site-header__inner">
          <Link
            aria-label="СМ ТЕХНО — на главную"
            className="site-header__brand"
            href="/"
          >
            <Image
              alt="СМ ТЕХНО — запчасти для спецтехники"
              className="site-header__logo"
              height={346}
              priority
              src="/brand/sm-techno-logo.png"
              width={939}
            />
          </Link>
          <Link className="site-header__catalog" href="/catalog">
            <span aria-hidden="true">☰</span>
            Каталог
          </Link>
          <form
            action="/catalog"
            aria-label="Поиск в шапке"
            className="site-header__search"
            role="search"
          >
            <label className="visually-hidden" htmlFor="header-search">
              Найти товар по названию или артикулу
            </label>
            <input
              id="header-search"
              name="q"
              placeholder="Артикул, название или модель техники"
              type="search"
            />
            <button aria-label="Найти" type="submit">
              <Search aria-hidden="true" />
            </button>
          </form>
          <div className="site-header__actions">
            <Headphones aria-hidden="true" />
            <div>
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
              {email ? <a href={`mailto:${email}`}>{email}</a> : <span>Поможем с подбором</span>}
            </div>
          </div>
          <MobileNavigation navigation={navigation} />
        </Container>
      </div>
    </header>
  );
}

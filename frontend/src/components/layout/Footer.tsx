import Image from "next/image";
import Link from "next/link";

import { Container } from "@/components/ui/Container";

import type { NavigationItem } from "./types";

export function Footer({
  navigation,
  phone,
  email,
}: {
  navigation: NavigationItem[];
  phone?: string | null;
  email?: string | null;
}) {
  return (
    <footer className="site-footer">
      <Container className="site-footer__grid">
        <div>
          <Link aria-label="СМ ТЕХНО — на главную" href="/">
            <Image
              alt="СМ ТЕХНО — запчасти для спецтехники"
              className="site-footer__logo"
              height={346}
              loading="eager"
              src="/brand/sm-techno-logo.png"
              width={939}
            />
          </Link>
          <p className="site-footer__note">
            Поставка запчастей и подбор решений для спецтехники. Независимый
            каталог продукции John Deere.
          </p>
        </div>
        <nav aria-label="Навигация в подвале" className="site-footer__links">
          {navigation.map((item) => (
            <Link href={item.url} key={`${item.url}:${item.label}`}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="site-footer__contacts">
          <strong>Связаться с нами</strong>
          {phone ? <a href={`tel:${phone.replace(/[^\d+]/gu, "")}`}>{phone}</a> : null}
          {email ? <a href={`mailto:${email}`}>{email}</a> : null}
          <Link href="/privacy-policy">Политика конфиденциальности</Link>
        </div>
      </Container>
      <Container className="site-footer__bottom">
        <span>© {new Date().getFullYear()} СМ ТЕХНО</span>
        <span>Не является заявлением об официальном представительстве.</span>
      </Container>
    </footer>
  );
}

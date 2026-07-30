import type { Metadata } from "next";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { RouteTransition } from "@/components/motion/RouteTransition";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";
import { getContacts, getNavigation, getSiteSettings } from "@/lib/directus/content";
import type { NavigationItem, SiteSettings } from "@/types/content";

import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru",
  ),
  title: {
    default: `${BRAND_NAME} — каталог комплектующих John Deere`,
    template: `%s — ${BRAND_NAME}`,
  },
  description: BRAND_DESCRIPTION,
};

async function getLayoutContent(): Promise<{
  navigation: NavigationItem[];
  settings: SiteSettings | null;
  phone: string | null;
}> {
  try {
    const [navigation, settings, contacts] = await Promise.all([
      getNavigation(),
      getSiteSettings(),
      getContacts(),
    ]);
    const phone =
      contacts.find((channel) => channel.type === "phone")?.value ??
      settings.phone;
    return { navigation, settings, phone };
  } catch {
    return { navigation: [], settings: null, phone: null };
  }
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const { navigation, phone, settings } = await getLayoutContent();

  return (
    <html data-scroll-behavior="smooth" lang="ru">
      <body>
        <a className="skip-link" href="#main-content">
          Перейти к содержанию
        </a>
        <div className="site-page">
          <Header
            companyName={settings?.companyName}
            email={settings?.email}
            logoId={settings?.logoId}
            navigation={navigation}
            phone={phone}
          />
          <RouteTransition>{children}</RouteTransition>
          <Footer
            companyName={settings?.companyName}
            email={settings?.email}
            footerText={settings?.footerText}
            logoId={settings?.logoId}
            navigation={navigation}
            phone={settings?.phone}
          />
        </div>
      </body>
    </html>
  );
}

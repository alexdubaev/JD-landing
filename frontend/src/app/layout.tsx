import type { Metadata } from "next";

import { Analytics } from "@/components/layout/Analytics";
import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";
import { RouteTransition } from "@/components/motion/RouteTransition";
import { CartProvider } from "@/lib/cart/context";
import { BRAND_DESCRIPTION, BRAND_NAME } from "@/lib/brand";
import { directusAssetUrl } from "@/lib/directus/assets";
import { getContacts, getNavigation, getSiteSettings } from "@/lib/directus/content";
import { buildRootTitle } from "@/lib/seo/site-title";
import type { NavigationItem, SiteSettings } from "@/types/content";

import "./globals.css";

export const metadataBase = new URL(
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru",
);

export async function generateMetadata(): Promise<Metadata> {
  let settings: SiteSettings | null = null;
  try {
    settings = await getSiteSettings();
  } catch {
    settings = null;
  }

  const companyName = settings?.companyName ?? BRAND_NAME;
  const title = buildRootTitle(settings?.seoTitle, companyName);
  const description = settings?.seoDescription?.trim() || BRAND_DESCRIPTION;
  const ogTitle = settings?.ogTitle?.trim() || title;
  const ogDescription = settings?.ogDescription?.trim() || description;
  const ogImage = settings?.defaultOgImageId
    ? directusAssetUrl(settings.defaultOgImageId, {
        width: 1200,
        height: 630,
      })
    : undefined;

  return {
    metadataBase,
    title: {
      default: title,
      template: `%s — ${companyName}`,
    },
    description,
    verification: {
      yandex: "b1a68d9bdd8d4bbb",
    },
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon-32.png", type: "image/png", sizes: "32x32" },
        { url: "/icon-16.png", type: "image/png", sizes: "16x16" },
      ],
      apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription,
      type: "website",
      locale: "ru_RU",
      siteName: companyName,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}

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
        <Analytics
          gtmId={settings?.gtmId}
          yandexMetricaId={settings?.yandexMetricaId}
        />
        <a className="skip-link" href="#main-content">
          Перейти к содержанию
        </a>
        <CartProvider>
          <div className="site-page">
            <Header
              companyName={settings?.companyName}
              logoId={settings?.logoId}
              navigation={navigation}
              phone={phone}
            />
            <RouteTransition>{children}</RouteTransition>
            <Footer
              companyName={settings?.companyName}
              footerText={settings?.footerText}
              logoId={settings?.logoId}
              navigation={navigation}
              phone={settings?.phone}
            />
          </div>
        </CartProvider>
      </body>
    </html>
  );
}

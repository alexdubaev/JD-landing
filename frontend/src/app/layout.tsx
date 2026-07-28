import type { Metadata } from "next";

import { Footer } from "@/components/layout/Footer";
import { Header } from "@/components/layout/Header";

import "./globals.css";

const primaryNavigation = [
  { label: "Каталог", url: "/catalog" },
  { label: "О компании", url: "/about" },
  { label: "Доставка", url: "/delivery" },
  { label: "Контакты", url: "/contacts" },
];

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://deere-shop.ru",
  ),
  title: {
    default: "Каталог продукции John Deere",
    template: "%s — каталог John Deere",
  },
  description:
    "Каталог техники и комплектующих John Deere с подбором решений под задачи клиента.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#main-content">
          Перейти к содержанию
        </a>
        <div className="site-page">
          <Header navigation={primaryNavigation} />
          {children}
          <Footer navigation={primaryNavigation} />
        </div>
      </body>
    </html>
  );
}

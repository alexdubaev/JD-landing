import type { Metadata } from "next";

import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}

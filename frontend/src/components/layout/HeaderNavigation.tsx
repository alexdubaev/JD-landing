"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import type { NavigationItem } from "./types";

const internalPathname = (url: string) => {
  if (!url.startsWith("/")) return null;
  const pathname = url.split(/[?#]/u, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
};

const isActive = (pathname: string, url: string) => {
  const target = internalPathname(url);
  if (!target) return false;
  const current = pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
  return target === "/" ? current === "/" : current === target || current.startsWith(`${target}/`);
};

export function HeaderNavigation({ navigation }: { navigation: NavigationItem[] }) {
  const pathname = usePathname() ?? "/";

  return (
    <nav aria-label="Основная навигация" className="site-header__navigation">
      {navigation.map((item) => (
        <Link
          aria-current={isActive(pathname, item.url) ? "page" : undefined}
          href={item.url}
          key={`${item.url}:${item.label}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { safeUrl } from "@/lib/security/urls";

import type { NavigationItem } from "./types";

const internalPathname = (url: string) => {
  if (!url.startsWith("/")) return null;
  const pathname = url.split(/[?#]/u, 1)[0] || "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/u, "") : pathname;
};

const isActive = (pathname: string, url: string) => {
  // An anchor such as "/#consultation" points to a section on the current
  // page, not to the page represented by a navigation item. Marking it active
  // on the homepage makes the link look permanently selected.
  if (url.includes("#")) return false;

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
          aria-current={isActive(pathname, safeUrl(item.url, "/") ?? "/") ? "page" : undefined}
          href={safeUrl(item.url, "/") ?? "/"}
          key={`${item.url}:${item.label}`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

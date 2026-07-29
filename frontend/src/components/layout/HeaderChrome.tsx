"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { ScrollProgress } from "./ScrollProgress";

export function HeaderChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <header
      className="site-header"
      data-header-variant={pathname === "/" ? "overlay" : "content"}
    >
      <ScrollProgress />
      {children}
    </header>
  );
}

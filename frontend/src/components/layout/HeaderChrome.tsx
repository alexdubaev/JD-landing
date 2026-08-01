"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ScrollProgress } from "./ScrollProgress";

export function HeaderChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const updateScrollState = () => setIsScrolled(window.scrollY > 12);

    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });
    return () => window.removeEventListener("scroll", updateScrollState);
  }, []);

  return (
    <header
      className="site-header"
      data-pathname={pathname}
      data-scrolled={isScrolled || undefined}
      data-header-variant={pathname === "/" ? "overlay" : "content"}
    >
      <ScrollProgress />
      {children}
    </header>
  );
}

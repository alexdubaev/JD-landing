"use client";

import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { NavigationItem } from "./types";

export function MobileNavigation({
  navigation,
}: {
  navigation: NavigationItem[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const label = isOpen ? "Закрыть меню" : "Открыть меню";

  return (
    <div className="mobile-navigation">
      <button
        aria-controls="mobile-menu"
        aria-expanded={isOpen}
        aria-label={label}
        className="mobile-navigation__toggle"
        onClick={() => setIsOpen((current) => !current)}
        type="button"
      >
        {isOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
      </button>
      {isOpen ? (
        <nav
          aria-label="Мобильная навигация"
          className="mobile-navigation__panel"
          id="mobile-menu"
        >
          {navigation.map((item) => (
            <Link
              href={item.url}
              key={`${item.url}:${item.label}`}
              onClick={() => setIsOpen(false)}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}

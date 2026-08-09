"use client";

import { Menu, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import type { NavigationItem } from "./types";

export function MobileNavigation({
  navigation,
  phone,
}: {
  navigation: NavigationItem[];
  phone?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const reduceMotion = useReducedMotion();
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
      <AnimatePresence initial={false}>
        {isOpen ? (
          <motion.nav
            animate={{ height: "auto", opacity: 1 }}
            aria-label="Мобильная навигация"
            className="mobile-navigation__panel"
            exit={{ height: 0, opacity: 0 }}
            id="mobile-menu"
            initial={reduceMotion ? false : { height: 0, opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.24 }}
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
            {phone ? (
              <a
                className="mobile-navigation__phone"
                href={`tel:${phone.replace(/[^\d+]/gu, "")}`}
                onClick={() => setIsOpen(false)}
              >
                {phone}
              </a>
            ) : null}
            <Link
              className="mobile-navigation__request"
              href="/parts-request"
              onClick={() => setIsOpen(false)}
            >
              Отправить запрос
            </Link>
          </motion.nav>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

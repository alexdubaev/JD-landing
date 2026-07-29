"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

export type AccordionItem = {
  answer: string;
  id: string;
  question: string;
};

export function AnimatedAccordion({ items }: { items: AccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const reduceMotion = useReducedMotion();

  return (
    <div className="accordion">
      {items.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `accordion-panel-${item.id}`;

        return (
          <div className="accordion__item" key={item.id}>
            <h3>
              <button
                aria-controls={panelId}
                aria-expanded={isOpen}
                onClick={() => setOpenId(isOpen ? null : item.id)}
                type="button"
              >
                <span>{item.question}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={isOpen ? "accordion__icon--open" : undefined}
                />
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.div
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  id={panelId}
                  initial={reduceMotion ? false : { height: 0, opacity: 0 }}
                  role="region"
                  transition={{ duration: reduceMotion ? 0 : 0.24 }}
                >
                  <p>{item.answer}</p>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

import { trackEvent } from "@/lib/analytics";

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
                onClick={() => {
                  setOpenId(isOpen ? null : item.id);
                  if (!isOpen) trackEvent("faq_open", { question: item.question });
                }}
                type="button"
              >
                <span>{item.question}</span>
                <ChevronDown
                  aria-hidden="true"
                  className={isOpen ? "accordion__icon--open" : undefined}
                />
              </button>
            </h3>
            <motion.div
              animate={{
                height: isOpen ? "auto" : 0,
                opacity: isOpen ? 1 : 0,
              }}
              aria-hidden={!isOpen}
              id={panelId}
              initial={false}
              role="region"
              style={{ overflow: "hidden" }}
              transition={{ duration: reduceMotion ? 0 : 0.24 }}
            >
              <p>{item.answer}</p>
            </motion.div>
          </div>
        );
      })}
    </div>
  );
}

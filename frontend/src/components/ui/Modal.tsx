"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export function Modal({
  children,
  isOpen,
  onClose,
  title,
  variant = "drawer",
}: {
  children: ReactNode;
  isOpen: boolean;
  onClose: () => void;
  title: string;
  variant?: "dialog" | "drawer";
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const content = (
    <AnimatePresence>
      {isOpen ? (
        <motion.div
          animate={{ opacity: 1 }}
          className={`modal modal--${variant}`}
          exit={{ opacity: 0 }}
          initial={reduceMotion ? false : { opacity: 0 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
        >
          <motion.div
            aria-labelledby={titleId}
            aria-modal="true"
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className={`modal__dialog modal__dialog--${variant}`}
            exit={{ opacity: 0, scale: 0.98, y: 12 }}
            initial={
              reduceMotion ? false : { opacity: 0, scale: 0.98, y: 12 }
            }
            role="dialog"
          >
            <header>
              <h2 id={titleId}>{title}</h2>
              <button
                aria-label="Закрыть"
                onClick={onClose}
                ref={closeRef}
                type="button"
              >
                <X aria-hidden="true" />
              </button>
            </header>
            <div className="modal__body">{children}</div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );

  return mounted ? createPortal(content, document.body) : content;
}

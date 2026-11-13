"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "lucide-react";
import { useEffect, useId, useLayoutEffect, useRef, useSyncExternalStore } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const reduceMotion = useReducedMotion();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    previousFocusRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], area[href], button, input, select, textarea, iframe, [contenteditable="true"], [tabindex]',
        ),
      ).filter((element) => {
        const style = window.getComputedStyle(element);
        return (
          element.tabIndex >= 0 &&
          !element.matches(":disabled") &&
          !element.closest('[hidden], [inert], [aria-hidden="true"]') &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          style.visibility !== "collapse" &&
          element.getClientRects().length > 0
        );
      });
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeElement = document.activeElement;

      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (event.shiftKey && (activeElement === first || !dialog.contains(activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeElement === last || !dialog.contains(activeElement))) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
      if (previousFocusRef.current?.isConnected) previousFocusRef.current.focus();
      previousFocusRef.current = null;
    };
  }, [isOpen]);

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
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
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

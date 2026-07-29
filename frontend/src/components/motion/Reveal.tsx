"use client";

import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function Reveal({
  accent = false,
  children,
  className,
  delay = 0,
  distance = 44,
  direction = "up",
}: {
  accent?: boolean;
  children: ReactNode;
  className?: string;
  delay?: number;
  distance?: number;
  direction?: "left" | "right" | "up";
}) {
  const reduceMotion = useReducedMotion();
  const calmDistance = Math.min(Math.abs(distance), 16);
  const offset =
    direction === "left"
      ? { x: -calmDistance, y: 0 }
      : direction === "right"
        ? { x: calmDistance, y: 0 }
        : { x: 0, y: calmDistance };

  return (
    <motion.div
      className={className}
      data-motion="reveal"
      data-motion-accent={accent || undefined}
      data-motion-direction={direction}
      initial={false}
      style={reduceMotion ? undefined : offset}
      transition={{
        delay: reduceMotion ? 0 : delay,
        duration: reduceMotion ? 0 : 0.4,
        ease: [0.25, 1, 0.5, 1],
      }}
      viewport={{ amount: 0.16, once: true }}
      whileInView={reduceMotion ? undefined : { opacity: 1, x: 0, y: 0 }}
    >
      {children}
    </motion.div>
  );
}

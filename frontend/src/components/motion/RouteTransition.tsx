"use client";

import { motion, useReducedMotion } from "motion/react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduceMotion = useReducedMotion();

  return (
    <div className="route-transition" data-testid="route-transition">
      <motion.div
        aria-hidden="true"
        animate={{ opacity: 0, scaleX: 0 }}
        className="route-transition__accent"
        initial={{ opacity: 1, scaleX: 1 }}
        key={pathname}
        transition={{
          duration: reduceMotion ? 0 : 0.42,
          ease: "easeOut",
        }}
      />
      {children}
    </div>
  );
}

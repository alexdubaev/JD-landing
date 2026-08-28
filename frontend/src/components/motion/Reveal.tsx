import type { ReactNode } from "react";

export function Reveal({
  accent = false,
  children,
  className,
  direction = "up",
}: {
  accent?: boolean;
  children: ReactNode;
  className?: string;
  direction?: "left" | "right" | "up";
}) {
  return (
    <div
      className={className}
      data-motion="reveal-static"
      data-motion-accent={accent || undefined}
      data-motion-direction={direction}
    >
      {children}
    </div>
  );
}

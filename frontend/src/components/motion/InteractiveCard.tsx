import type { ReactNode } from "react";

export function InteractiveCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className} data-motion="interactive-card">
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

export function RouteTransition({ children }: { children: ReactNode }) {
  return (
    <div className="route-transition" data-testid="route-transition">
      <div aria-hidden="true" className="route-transition__accent" />
      {children}
    </div>
  );
}

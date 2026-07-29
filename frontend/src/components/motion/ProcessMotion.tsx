import type { ReactNode } from "react";

export function ProcessMotion({ children }: { children: ReactNode }) {
  return (
    <div className="home-selection__motion">
      <div
        aria-hidden="true"
        className="home-selection__progress"
        data-testid="process-progress"
      />
      {children}
    </div>
  );
}

import type { ReactNode } from "react";

export function HeroMotion({
  children,
  labelledBy,
  media,
}: {
  children: ReactNode;
  labelledBy?: string;
  media: ReactNode;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className="commerce-hero"
      data-motion="hero-static"
      data-testid="hero-motion"
    >
      <div
        aria-hidden="true"
        className="commerce-hero__media"
        data-testid="hero-motion-media"
      >
        {media}
      </div>
      <div aria-hidden="true" className="commerce-hero__glow" />
      {children}
    </section>
  );
}

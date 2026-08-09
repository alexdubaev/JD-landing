"use client";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useRef, type ReactNode } from "react";

gsap.registerPlugin(useGSAP);
const supportsMatchMedia =
  typeof window !== "undefined" && typeof window.matchMedia === "function";
if (supportsMatchMedia) gsap.registerPlugin(ScrollTrigger);

export function ProcessMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (!supportsMatchMedia) {
        gsap.set([".home-selection__progress", ".home-step"], {
          clearProps: "all",
          autoAlpha: 1,
        });
        return;
      }
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const timeline = gsap.timeline({
          scrollTrigger: {
            trigger: root.current,
            start: "top 85%",
            once: true,
          },
        });
        timeline
          .fromTo(
            ".home-selection__progress",
            { scaleX: 0 },
            { scaleX: 1, duration: 0.4, ease: "power2.out" },
          )
          .from(
            ".home-step",
            {
              autoAlpha: 0,
              y: 12,
              duration: 0.36,
              stagger: 0.08,
              ease: "power2.out",
            },
            0.08,
          );
      });
      media.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set([".home-selection__progress", ".home-step"], {
          clearProps: "all",
          autoAlpha: 1,
        });
      });
      return () => media.revert();
    },
    { scope: root },
  );
  return (
    <div className="home-selection__motion" ref={root}>
      <div
        aria-hidden="true"
        className="home-selection__progress"
        data-testid="process-progress"
      />
      {children}
    </div>
  );
}

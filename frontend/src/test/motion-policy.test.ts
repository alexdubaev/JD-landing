import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = process.cwd();

describe("motion policy", () => {
  it("keeps section reveals short and disables their duration for reduced motion", () => {
    const source = readFileSync(
      path.join(
        projectRoot,
        "src",
        "components",
        "motion",
        "Reveal.tsx",
      ),
      "utf8",
    );

    expect(source).toContain("duration: reduceMotion ? 0 : 0.4");
    expect(source).not.toMatch(/blur|scale/iu);
  });

  it("disables CSS animation and transitions for reduced motion", () => {
    const css = readFileSync(
      path.join(projectRoot, "src", "app", "globals.css"),
      "utf8",
    );
    const reducedMotionBlock = css.slice(
      css.indexOf("@media (prefers-reduced-motion: reduce)"),
    );

    expect(reducedMotionBlock).toContain("animation-duration: 0.01ms");
    expect(reducedMotionBlock).toContain("transition-duration: 0.01ms");
  });
});

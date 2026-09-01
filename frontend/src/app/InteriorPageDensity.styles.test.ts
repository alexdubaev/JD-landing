import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

describe("interior page density", () => {
  it("uses the catalog heading scale and permits wrapping for every interior-page h1 without changing the homepage hero", () => {
    const desktopContract = styles.match(
      /\.catalog-heading h1,\s*\.product-detail h1,\s*\.content-page__heading h1,\s*\.page-heading--compact h1,\s*\.article-detail h1,\s*\.parts-request-page__surface h1,\s*\.cart-page__heading h1,\s*\.page-state h1\s*\{[^}]*font-size:\s*clamp\(2\.5rem,\s*4\.5vw,\s*4rem\);[^}]*overflow-wrap:\s*anywhere;[^}]*white-space:\s*normal;/u,
    );

    expect(desktopContract?.[0]).toBeDefined();
    expect(desktopContract?.[0]).not.toContain(".commerce-hero");
    expect(styles).toMatch(
      /@media \(max-width:\s*40rem\)\s*\{[\s\S]*?\.catalog-heading h1,\s*\.product-detail h1,\s*\.content-page__heading h1,\s*\.page-heading--compact h1,\s*\.article-detail h1,\s*\.parts-request-page__surface h1,\s*\.cart-page__heading h1,\s*\.page-state h1\s*\{[^}]*font-size:\s*clamp\(2\.25rem,\s*10vw,\s*3\.25rem\);/u,
    );
  });

  it("keeps information-page introductions and sections compact without decorative rules", () => {
    expect(styles).toMatch(
      /\.content-page__heading\s*\{[^}]*margin:\s*clamp\(1\.5rem,\s*3vw,\s*2\.5rem\) 0 1\.5rem;/u,
    );
    expect(styles).toMatch(
      /\.content-page__section\s*\{[^}]*padding-block:\s*1\.5rem 2rem;[^}]*border-top:\s*0;/u,
    );
  });
});

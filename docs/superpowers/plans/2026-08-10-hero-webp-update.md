# Hero WebP Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore an enhanced WebP hero image on the homepage without changing its supplied composition or aspect ratio.

**Architecture:** Keep the original PNG unchanged, add a versioned WebP under the local Next.js public image directory, and render it as decorative media through the existing `HeroMotion` boundary. A focused component test verifies the media contract; the existing CSS overlay retains legible foreground content.

**Tech Stack:** Next.js 16, React 19, TypeScript, `next/image`, Vitest, image generation/editing and WebP export.

## Global Constraints

- Preserve the supplied image's 1919:819 aspect ratio, dark-green technical drawing aesthetic, blank left copy space, and right-side exploded mechanism.
- Do not alter the original supplied PNG.
- Do not make unsupported claims or imply official John Deere representation.
- Do not stage the pre-existing `.tmp/` directory.

---

### Task 1: Add and verify local hero media

**Files:**

- Create: `frontend/public/images/home/deere-shop-hero-v2.webp`
- Modify: `frontend/src/components/sections/HomeHero.tsx:1-161`
- Modify: `frontend/src/components/sections/HomeHero.test.tsx:1-60`

**Interfaces:**

- Consumes: `HeroMotion` accepts `media: ReactNode` and positions it in `.commerce-hero__media`.
- Produces: `HomeHero` passes a decorative `next/image` element with `src="/images/home/deere-shop-hero-v2.webp"`, `fill`, `priority`, `sizes="100vw"`, and an empty alternative text.

- [ ] **Step 1: Write the failing test**

```tsx
it("renders the local WebP hero illustration as decorative media", () => {
  const { container } = render(<HomeHero contacts={[]} h1="John Deere parts" section={heroSection} settings={{ phone: null } as SiteSettings} />);
  const image = container.querySelector(".commerce-hero__image");
  expect(image).toHaveAttribute("alt", "");
  expect(decodeURIComponent(image?.getAttribute("src") ?? "")).toContain("/images/home/deere-shop-hero-v2.webp");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- src/components/sections/HomeHero.test.tsx`

Expected: FAIL because `HomeHero` currently supplies `media={null}` and renders no `.commerce-hero__image`.

- [ ] **Step 3: Produce and add the WebP asset**

Create a non-destructive, enhanced version of `data/deere-shop-codex-hero/deere_shop_hero_assetpack/images/hero_blok.png`, preserving the exact aspect ratio and composition. Export the selected output to `frontend/public/images/home/deere-shop-hero-v2.webp`.

- [ ] **Step 4: Write minimal implementation**

```tsx
import Image from "next/image";

media={
  <Image
    alt=""
    className="commerce-hero__image"
    fill
    priority
    sizes="100vw"
    src="/images/home/deere-shop-hero-v2.webp"
  />
}
```

- [ ] **Step 5: Run the focused test to verify it passes**

Run: `npm run test -- src/components/sections/HomeHero.test.tsx`

Expected: PASS with the new WebP source and empty alternative text asserted.

- [ ] **Step 6: Verify the asset visually and run project checks**

Run: `npm run test`, `npm run lint`, `npm run typecheck`, and `npm run build` from `frontend`.

Expected: all commands exit with status 0; inspect the WebP dimensions and final rendered hero at desktop and mobile widths.

- [ ] **Step 7: Commit and release**

```bash
git add frontend/public/images/home/deere-shop-hero-v2.webp frontend/src/components/sections/HomeHero.tsx frontend/src/components/sections/HomeHero.test.tsx docs/superpowers/plans/2026-08-10-hero-webp-update.md
git commit -m "feat: restore enhanced homepage hero"
git push -u origin agent/production-infrastructure
```

After the push, run the repository deployment command from `deploy/deploy.sh` using the configured production target and report the resulting public URL or deployment error.

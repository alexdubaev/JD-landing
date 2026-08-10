# Hero image WebP update

## Goal

Restore a high-quality engineering-illustration hero image on the homepage while preserving the supplied image's 1919:819 aspect ratio, dark green industrial mood, left-side copy space, and exploded-mechanism composition on the right.

## Asset

The supplied `hero_blok.png` will be enhanced non-destructively for clarity and detail, then exported as `frontend/public/images/home/deere-shop-hero-v2.webp`. The original source remains unchanged. The rendered asset contains no text or claims.

## Frontend

`HomeHero` will render the new local WebP through `next/image` as the media passed to `HeroMotion`. The existing hero overlay maintains copy readability and responsive object positioning. The component test will assert that the decorative hero image is present with an appropriate alternative text.

## Verification and release

Run the focused hero test, full test suite, lint, type check, and production build. Commit only the new asset and related hero files, push the current branch, and invoke the existing VPS deployment script. The pre-existing untracked `.tmp/` directory is excluded.

# Compact product card design

## Goal

Make the product-detail header substantially more compact without changing its content, interactions, or mobile layout.

## Design

- Keep the two-column desktop layout and existing responsive breakpoints.
- Reduce the main gallery's visual footprint to roughly half of the current technical-plate presentation.
- Remove the main image border, background, shadow, and image padding so product photos sit cleanly in their allocated space.
- Reduce thumbnail dimensions and spacing.
- Reduce the H1 maximum size to 2.5rem and tighten the surrounding metadata, commercial, action, and notice spacing.
- Preserve `object-fit: contain`, so no product image is cropped.

## Scope

Only `frontend/src/app/globals.css` changes. Product content, Directus data, components, and accessibility semantics remain unchanged.

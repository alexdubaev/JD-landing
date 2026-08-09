# Parts request first-screen design

## Goal

Make `/parts-request` immediately useful on desktop: when a visitor opens it,
they see the request form without having to scroll past a separate page hero.
The target composition follows the approved reference image while remaining
consistent with the existing DEERE-SHOP interface and responsive behavior.

## Scope

- Keep the breadcrumbs, but move them into the green request surface.
- Render the CMS H1 and short introductory text directly above the form in the
  same green surface; do not retain a separate pale heading block.
- Keep the existing request workflow unchanged: list parsing, Excel/photo
  attachment, validation, Turnstile, lead submission, analytics and success
  state.
- Keep the right-hand list of outcomes sourced from the existing CMS section.
- Keep the metadata and breadcrumb JSON-LD intact.

## Layout

On desktop, the page is a single green section with a compact content width.
Breadcrumbs sit at its top, followed by H1 and the short description. Beneath
them, a two-column grid places the white form surface on the left and the dark
green outcome panel on the right. The first form controls, contact fields and
submit button remain visible in the initial desktop viewport at the reference
viewport size whenever a Turnstile challenge is not expanded.

The component must preserve semantic landmarks: one H1, navigation breadcrumbs,
form labels and an outcomes list. Motion wrappers must not create empty space
or delay interaction.

## Responsive behavior

- At tablet widths, preserve the form-first reading order and allow the outcome
  panel to move below the form once two columns become too narrow.
- On phones, breadcrumbs, heading, description, form and outcome panel stack
  with reduced spacing. The three contact inputs and outcome list use one
  column.
- Keyboard focus, attachment shortcuts and error/success states remain as they
  are today.

## Implementation boundaries

- `frontend/src/app/parts-request/page.tsx` will own the page-level green
  surface, breadcrumbs and H1.
- `frontend/src/components/sections/HomePartsRequest.tsx` will render only the
  CMS description, request form and outcomes grid when used by this route,
  avoiding a duplicated heading.
- `frontend/src/app/globals.css` will replace the separate heading styles with
  compact styles for the integrated request page and adjust the section spacing.
- The existing route and form tests will be extended to assert the integrated
  breadcrumb/H1 structure and preserve the submitted request behavior.

## Acceptance criteria

1. `/parts-request` has no standalone pale heading area before the request UI.
2. Breadcrumbs appear on the green background above the H1.
3. Desktop users see the heading and the request form immediately on opening
   the page, matching the hierarchy of the approved reference.
4. CMS-provided title, description and outcome items remain editable without a
   frontend deployment.
5. Existing lead submission, file attachment, UTM collection, metadata and
   JSON-LD behavior continue to work.

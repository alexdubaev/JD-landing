# Mobile hero: search-first composition

## Goal

Make the mobile homepage hero compact and task-oriented. A visitor should be able to
identify a part or choose a bulk-request method without seeing duplicate contact actions
or a large empty area.

## Selected direction

Use the hero as a single search-and-request instrument.

1. Keep the existing header, title, description and part search.
2. Keep the three bulk-request methods in the hero: paste a list, upload an Excel file,
   and send a photo.
3. Remove the phone number and the "Отправить запрос" link from the mobile hero only.
   The fixed mobile contact bar remains the dedicated place for calling, messaging and
   opening a request.
4. Arrange the search control as a compact yellow surface, with input and submit action
   grouped as one instrument. Preserve the existing accessible form and suggestion
   behavior.
5. Place the bulk-request prompt directly beneath the search. Present its three links as
   equal, touch-friendly actions in a three-column row; keep their current destinations
   and analytics events.
6. Remove the fixed mobile hero height and use content-led vertical spacing so the section
   ends immediately after the tools. Desktop composition must not change.

## Visual rules

- Preserve the existing deep-green canvas and yellow accent; yellow remains reserved for
  the search action and selected mobile contact-bar action.
- Use the existing neutral sans-serif and compact B2B type hierarchy. The mobile H1 stays
  readable and balanced, but is not allowed to dominate the viewport.
- Use 44px minimum touch targets for search and scenario links.
- Do not introduce cards, shadows, rounded decorative containers, or new imagery.
- On narrow devices (320px and up), prevent horizontal overflow and avoid one-word title
  orphans where possible.

## Behavior and accessibility

- Search submission, keyboard navigation through suggestions, and analytics remain
  unchanged.
- The three scenario links remain ordinary keyboard-accessible links with their current
  tracking events.
- The fixed contact bar remains visible on mobile and continues to provide call, message,
  and request routes.

## Verification

- Check at 320px, 390px, and 768px.
- Confirm the hero has no blank lower area after the scenario links.
- Confirm phone and request CTA occur once in the first viewport: in the fixed contact bar,
  not in the hero.
- Run existing relevant unit tests plus typecheck and lint.

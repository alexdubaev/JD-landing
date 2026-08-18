// Task 13 (R9): ADR-003 field-level import profiles.
//
// The source of truth is defined per FIELD, not per product card. Every
// profile carries an explicit allowlist of `products` fields it may write;
// a field outside the allowlist present in an input row becomes a recorded
// conflict and is never silently ignored.
//
// - `operations-default` is the only profile that needs no approval: it may
//   update EXACTLY the seven operational ADR-003 fields on existing
//   products.
// - Every other profile is opt-in and requires an --approval-ref=<string>
//   before ANY client request is made.
// - `status` is writable by NO profile: new products are always created as
//   `draft` (incoming status values are forced to draft) and the status of
//   existing products can never be changed by an import (publication belongs
//   to Publisher/Admin per ADR-003).
// - `slug`, `category`, SEO fields, `currency`, `specifications`,
//   `documents`, `reviewed_by` and every other products field stay
//   editor-owned: no importer profile may write them (mass slug/URL/source
//   migrations are a separate Admin-gated release).
// - `analogs-opt-in` owns no extra products field; it plans edges in the
//   `products_analogs` junction (canonical_key idempotent) instead.

const deepFreeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const key of Object.keys(value)) deepFreeze(value[key]);
    Object.freeze(value);
  }
  return value;
};

/** The ADR-003 default existing-product allowlist — exactly these 7 fields. */
export const OPERATIONS_FIELDS = Object.freeze([
  "price",
  "price_status",
  "availability_status",
  "delivery_status",
  "source_name",
  "source_url",
  "verified_at",
]);

/** Input keys with engine-level semantics (never profile-writable fields). */
export const SYSTEM_INPUT_KEYS = Object.freeze(["sku", "status"]);

/**
 * Relation inputs are backed by junction collections, not by a `products`
 * column: the planner turns them into junction row creations.
 */
export const ANALOGS_RELATION = deepFreeze({
  inputKey: "analogs",
  collection: "products_analogs",
  allowedTypes: ["analog", "oem_cross", "compatible", "superseded_by"],
  defaultSourceName: "catalog-import",
});

export const PROFILES = deepFreeze({
  "operations-default": deepFreeze({
    name: "operations-default",
    optIn: false,
    fields: OPERATIONS_FIELDS,
    relations: [],
    description:
      "Price-list operations: updates ONLY the seven operational ADR-003 fields of existing products; creates new products as drafts.",
  }),
  "trusted-weight": deepFreeze({
    name: "trusted-weight",
    optIn: true,
    fields: deepFreeze([...OPERATIONS_FIELDS, "weight"]),
    relations: [],
    description:
      "Operations plus product weight from a trusted source (opt-in). Stops until the schema actually provides products.weight.",
  }),
  "editorial-opt-in": deepFreeze({
    name: "editorial-opt-in",
    optIn: true,
    fields: deepFreeze([
      ...OPERATIONS_FIELDS,
      "title",
      "short_description",
      "full_description",
      "image_alt",
    ]),
    relations: [],
    description:
      "Operations plus editorial text fields (opt-in, full diff preview and explicit approval required before apply).",
  }),
  "media-opt-in": deepFreeze({
    name: "media-opt-in",
    optIn: true,
    fields: deepFreeze([...OPERATIONS_FIELDS, "main_image", "gallery"]),
    relations: [],
    description:
      "Operations plus main_image and the legacy gallery JSON (opt-in). product_images stays the canonical gallery model after R7B.",
  }),
  "codes-opt-in": deepFreeze({
    name: "codes-opt-in",
    optIn: true,
    fields: deepFreeze([...OPERATIONS_FIELDS, "mpn"]),
    relations: [],
    description:
      "Operations plus the primary manufacturer part number products.mpn (opt-in). Additional codes need a product_codes feed contract (not yet approved).",
  }),
  "analogs-opt-in": deepFreeze({
    name: "analogs-opt-in",
    optIn: true,
    fields: OPERATIONS_FIELDS,
    relations: deepFreeze([ANALOGS_RELATION]),
    description:
      "Operations plus products_analogs edge creation by SKU (opt-in, canonical_key idempotent; mirrors impossible by construction).",
  }),
});

export const PROFILE_NAMES = Object.freeze(Object.keys(PROFILES));

export function getProfile(name) {
  const profile = PROFILES[name];
  if (!profile) {
    throw new Error(
      `Unknown importer profile "${name}". Known profiles: ${PROFILE_NAMES.join(", ")}`,
    );
  }
  return profile;
}

export const isWritableField = (profile, field) =>
  profile.fields.includes(field);

export const relationInputKeys = (profile) =>
  profile.relations.map((relation) => relation.inputKey);

export const isRelationInput = (profile, key) =>
  relationInputKeys(profile).includes(key);

export const isSystemInputKey = (key) => SYSTEM_INPUT_KEYS.includes(key);

/**
 * Approval guard. An opt-in profile without a non-empty approval reference
 * must refuse BEFORE any client request is made (ADR-003: explicit
 * confirmation is part of the opt-in contract).
 */
export function assertProfileApproval(profile, approvalRef) {
  const evaluation = evaluateProfileApproval(profile, approvalRef);
  if (!evaluation.ok) throw new Error(evaluation.detail);
  return true;
}

export function evaluateProfileApproval(profile, approvalRef) {
  if (!profile?.optIn) return { ok: true, detail: null };
  const reference = String(approvalRef ?? "").trim();
  if (!reference) {
    return {
      ok: false,
      detail:
        `Profile ${profile.name} is opt-in and requires --approval-ref=<reference> ` +
        "before any request is made (ADR-003 field-level source of truth)",
    };
  }
  return { ok: true, detail: null };
}

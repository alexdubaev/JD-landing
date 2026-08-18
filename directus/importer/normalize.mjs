// Task 13 (R9): input row normalization for the catalog importer.
//
// Normalization never drops or renames input keys — a forbidden key must
// survive so the planner can report it as a conflict. Only the VALUES of
// known keys are canonicalized:
// - `sku` is trimmed (stored form preserved) and a `skuKey` (uppercase
//   alphanumeric, the migrations/backfill-product-search.mjs contract) is
//   derived for matching against products.sku_normalized;
// - prices/weights become finite non-negative numbers or null;
// - `verified_at` becomes an ISO-8601 UTC timestamp or null;
// - optional strings are trimmed with "" collapsing to null;
// - `gallery` keeps an array of trimmed non-empty strings;
// - `analogs` keeps an array of {sku, relation_type, note?, source_name?};
// - `status` is trimmed/lowercased but never applied (creates force draft).
//
// Rows with unparseable values are returned with ok:false plus typed errors;
// the planner turns them into recorded conflicts (never silent coercion).

/**
 * The shared normalization contract (matches
 * migrations/backfill-product-search.mjs): uppercase, trim, and collapse
 * every non-alphanumeric character.
 */
export function normalizeCode(value) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

export function parsePrice(value) {
  if (value == null) return { ok: true, value: null };
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) {
      return { ok: false, message: `invalid numeric value ${value}` };
    }
    return { ok: true, value };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "expected a number or a numeric string" };
  }
  const cleaned = value.replace(/[\s\u00a0]/g, "");
  if (cleaned === "") return { ok: true, value: null };
  if (!/^\d+(?:[.,]\d+)?$/.test(cleaned)) {
    return { ok: false, message: `cannot parse "${value}" as a price` };
  }
  return { ok: true, value: Number(cleaned.replace(",", ".")) };
}

export function parseTimestamp(value) {
  if (value == null) return { ok: true, value: null };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return { ok: false, message: "invalid Date value" };
    }
    return { ok: true, value: value.toISOString() };
  }
  if (typeof value !== "string") {
    return { ok: false, message: "expected an ISO date string" };
  }
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: null };

  let date = null;
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const ruDate = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(trimmed);
  if (isoDate) {
    date = new Date(`${isoDate[0]}T00:00:00.000Z`);
  } else if (ruDate) {
    date = new Date(`${ruDate[3]}-${ruDate[2]}-${ruDate[1]}T00:00:00.000Z`);
  } else {
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) date = new Date(parsed);
  }
  if (!date || Number.isNaN(date.getTime())) {
    return { ok: false, message: `cannot parse "${value}" as a date` };
  }
  return { ok: true, value: date.toISOString() };
}

const normalizeOptionalString = (value) => {
  if (value == null) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

const normalizeGallery = (value) => {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "gallery must be an array of file ids" };
  }
  const ids = [];
  for (const entry of value) {
    if (typeof entry !== "string") {
      return { ok: false, message: "gallery entries must be strings" };
    }
    const trimmed = entry.trim();
    if (trimmed !== "") ids.push(trimmed);
  }
  return { ok: true, value: ids };
};

const normalizeAnalogs = (value) => {
  if (value == null) return { ok: true, value: [] };
  if (!Array.isArray(value)) {
    return { ok: false, message: "analogs must be an array of edges" };
  }
  const edges = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return { ok: false, message: "each analog must be an object" };
    }
    const sku = normalizeOptionalString(entry.sku);
    if (!sku) {
      return { ok: false, message: "each analog requires a non-empty sku" };
    }
    edges.push({
      sku,
      relation_type: normalizeOptionalString(entry.relation_type),
      note: normalizeOptionalString(entry.note),
      source_name: normalizeOptionalString(entry.source_name),
    });
  }
  return { ok: true, value: edges };
};

// Catalog keys no profile may write but the planner KNOWS about: their
// presence is a planner-level conflict, never a normalize-level reject.
const FORBIDDEN_BUT_KNOWN_KEYS = [
  "slug",
  "category",
  "seo_title",
  "seo_description",
  "og_image",
  "currency",
];

const STRING_FIELDS = [
  "price_status",
  "availability_status",
  "delivery_status",
  "source_name",
  "source_url",
  "title",
  "short_description",
  "full_description",
  "image_alt",
  "mpn",
  "main_image",
];

/**
 * Normalizes one raw NDJSON row. Unknown keys are PRESERVED untouched —
 * the planner reports them as forbidden fields instead of dropping them.
 */
export function normalizeRow(rawRow, offset = 0) {
  const errors = [];
  // Key names are trimmed ("  sku " and "sku" are the same field).
  const row = {};
  if (rawRow && typeof rawRow === "object" && !Array.isArray(rawRow)) {
    for (const [key, value] of Object.entries(rawRow)) {
      row[String(key).trim()] = value;
    }
  }

  if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
    errors.push({ field: "$row", code: "invalid-row", detail: "row must be a JSON object" });
  }

  const rawSku = row.sku == null ? "" : String(row.sku).trim();
  row.sku = rawSku;
  const skuKey = normalizeCode(rawSku);
  if (!skuKey) {
    errors.push({ field: "sku", code: "missing-sku", detail: "sku is required and must contain letters or digits" });
  }

  if ("status" in row) {
    row.status = row.status == null ? null : String(row.status).trim().toLowerCase();
  }

  for (const numericField of ["price", "weight"]) {
    if (!(numericField in row)) continue;
    const parsed = parsePrice(row[numericField]);
    if (!parsed.ok) {
      errors.push({ field: numericField, code: "invalid-value", detail: parsed.message });
      continue;
    }
    row[numericField] = parsed.value;
  }

  if ("verified_at" in row) {
    const parsed = parseTimestamp(row.verified_at);
    if (!parsed.ok) {
      errors.push({ field: "verified_at", code: "invalid-value", detail: parsed.message });
    } else {
      row.verified_at = parsed.value;
    }
  }

  for (const field of STRING_FIELDS) {
    if (field in row) row[field] = normalizeOptionalString(row[field]);
  }

  if ("gallery" in row) {
    const parsed = normalizeGallery(row.gallery);
    if (!parsed.ok) {
      errors.push({ field: "gallery", code: "invalid-value", detail: parsed.message });
    } else {
      row.gallery = parsed.value;
    }
  }

  if ("analogs" in row) {
    const parsed = normalizeAnalogs(row.analogs);
    if (!parsed.ok) {
      errors.push({ field: "analogs", code: "invalid-value", detail: parsed.message });
    } else {
      row.analogs = parsed.value;
    }
  }

  // Unknown keys are ERRORS, not drops: the row survives untouched so the
  // planner can report them as forbidden/conflicting fields (ADR-003:
  // a forbidden field is never silently ignored).
  const KNOWN_ROW_KEYS = new Set([
    "sku", "status", "price", "weight", "verified_at", "gallery", "analogs",
    ...STRING_FIELDS,
    // Recognized-but-forbidden inputs: the PLANNER must report these as
    // forbidden fields (conflicts), so normalize never rejects them as
    // unknown (INVARIANT 1 depends on them reaching forbiddenInputKeys).
    ...FORBIDDEN_BUT_KNOWN_KEYS,
  ]);
  for (const key of Object.keys(row)) {
    if (!KNOWN_ROW_KEYS.has(key)) {
      errors.push({
        field: key,
        code: "unknown-key",
        detail: "unknown input key; the planner reports it as a forbidden field",
      });
    }
  }

  return { offset, ok: errors.length === 0, row, skuKey: skuKey || null, errors };
}

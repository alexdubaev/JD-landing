// seo-worker/src/evidence.mjs
//
// Evidence tiers and claim->source validation for SEO work items.
//
// Invariant 4 (evidence tiers + claim->source validation): no recommendation is
// accepted without evidence, and every evidence item must trace to a source.
// A claim with no evidence, or evidence with no source, is rejected — never
// silently accepted. Proven by test/evidence.test.mjs.
//
// Reusable concept (rewritten under tests for this schema): evidence tiers and
// claim->source linkage. No code is copied from prior implementations.

/**
 * Evidence tiers, strongest first.
 *
 * - authoritative: official / verified primary source (e.g. confirmed catalogue
 *   data, brand documentation with verified_at).
 * - corroborated:  several independent sources agree.
 * - single:        one reliable source.
 * - weak:          heuristic / inferred / single weak source.
 */
export const EVIDENCE_TIERS = Object.freeze([
  Object.freeze({ name: 'authoritative', rank: 4 }),
  Object.freeze({ name: 'corroborated', rank: 3 }),
  Object.freeze({ name: 'single', rank: 2 }),
  Object.freeze({ name: 'weak', rank: 1 }),
]);

const TIER_RANK = new Map(EVIDENCE_TIERS.map((t) => [t.name, t.rank]));

/**
 * Numeric rank of a tier. Unknown / missing tiers return 0 (weakest possible),
 * so an unrecognised tier never satisfies a threshold.
 *
 * @param {string} [tier]
 * @returns {number}
 */
export function rankEvidenceTier(tier) {
  return TIER_RANK.get(tier) ?? 0;
}

/**
 * Strongest tier name present in the evidence list, or null when empty.
 *
 * @param {Array<{tier?: string}>} [evidence]
 * @returns {string|null}
 */
export function bestEvidenceTier(evidence = []) {
  if (!Array.isArray(evidence) || evidence.length === 0) return null;
  let best = null;
  let bestRank = 0;
  for (const item of evidence) {
    const r = rankEvidenceTier(item?.tier);
    if (r > bestRank) {
      bestRank = r;
      best = item.tier;
    }
  }
  return best;
}

/**
 * Numeric rank of the strongest evidence item (0 for empty).
 *
 * @param {Array<{tier?: string}>} [evidence]
 * @returns {number}
 */
export function bestEvidenceRank(evidence = []) {
  return rankEvidenceTier(bestEvidenceTier(evidence));
}

/**
 * Whether the strongest evidence meets at least `minTier`.
 *
 * @param {Array<{tier?: string}>} evidence
 * @param {string} minTier
 * @returns {boolean}
 */
export function meetsTierThreshold(evidence, minTier) {
  return bestEvidenceRank(evidence) >= rankEvidenceTier(minTier);
}

function hasUsableSource(source) {
  if (!source || typeof source !== 'object') return false;
  if (!source.type || String(source.type).trim() === '') return false;
  const url = source.url ? String(source.url).trim() : '';
  const reference = source.reference ? String(source.reference).trim() : '';
  return url !== '' || reference !== '';
}

/**
 * Validate that a recommendation's evidence is complete and every claim traces
 * to a usable source.
 *
 * Accepted shape:
 *   {
 *     evidence: [
 *       { claim: string, tier: string, detail?: string,
 *         source: { type: string, url?: string, reference?: string, retrieved_at?: string } }
 *     ],
 *     minTier?: string   // optional threshold, defaults to no threshold
 *   }
 *
 * @param {{evidence?: any[], minTier?: string}} [input]
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateEvidence(input = {}) {
  const errors = [];
  const evidence = Array.isArray(input.evidence) ? input.evidence : [];

  if (evidence.length === 0) {
    errors.push('evidence: at least one evidence item is required for a recommendation');
  }

  for (let i = 0; i < evidence.length; i += 1) {
    const item = evidence[i];
    const where = `evidence[${i}]`;
    const claim = item && typeof item.claim === 'string' ? item.claim.trim() : '';
    if (claim === '') {
      errors.push(`${where}: claim text is required (claim->source link starts here)`);
    }
    if (rankEvidenceTier(item && item.tier) === 0) {
      errors.push(`${where}: unknown or missing tier "${item && item.tier}"`);
    }
    if (!hasUsableSource(item && item.source)) {
      errors.push(
        `${where}: a usable source is required (must include type and url or reference)`,
      );
    }
  }

  if (input.minTier && evidence.length > 0 && !meetsTierThreshold(evidence, input.minTier)) {
    errors.push(
      `evidence: best tier does not meet the required minimum "${input.minTier}"`,
    );
  }

  return { ok: errors.length === 0, errors };
}

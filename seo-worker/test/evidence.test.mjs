import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EVIDENCE_TIERS,
  rankEvidenceTier,
  bestEvidenceTier,
  bestEvidenceRank,
  meetsTierThreshold,
  validateEvidence,
} from '../src/evidence.mjs';

test('EVIDENCE_TIERS exposes the four documented tiers', () => {
  assert.deepEqual(EVIDENCE_TIERS.map((t) => t.name), [
    'authoritative',
    'corroborated',
    'single',
    'weak',
  ]);
});

test('tiers are ranked high -> low: authoritative > corroborated > single > weak', () => {
  assert.ok(rankEvidenceTier('authoritative') > rankEvidenceTier('corroborated'));
  assert.ok(rankEvidenceTier('corroborated') > rankEvidenceTier('single'));
  assert.ok(rankEvidenceTier('single') > rankEvidenceTier('weak'));
});

test('unknown tier has rank 0 (weakest possible)', () => {
  assert.equal(rankEvidenceTier('hearsay'), 0);
  assert.equal(rankEvidenceTier(undefined), 0);
});

test('bestEvidenceTier returns the strongest tier present', () => {
  const ev = [
    { tier: 'weak', source: { type: 'crawl', url: 'u1' } },
    { tier: 'authoritative', source: { type: 'official', url: 'u2' } },
    { tier: 'single', source: { type: 'crawl', url: 'u3' } },
  ];
  assert.equal(bestEvidenceTier(ev), 'authoritative');
  assert.ok(bestEvidenceRank(ev) > rankEvidenceTier('single'));
});

test('bestEvidenceTier on empty evidence is null', () => {
  assert.equal(bestEvidenceTier([]), null);
  assert.equal(bestEvidenceRank([]), 0);
});

test('invariant 4a: recommendation with no evidence is rejected', () => {
  const r = validateEvidence({ evidence: [] });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /evidence/i.test(e)), JSON.stringify(r.errors));
});

test('invariant 4b: evidence item without a source is rejected (claim->source broken)', () => {
  const r = validateEvidence({
    evidence: [{ claim: 'seo_title is empty', tier: 'single' /* no source */ }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /source/i.test(e)), JSON.stringify(r.errors));
});

test('invariant 4c: source with neither url nor reference is rejected', () => {
  const r = validateEvidence({
    evidence: [
      {
        claim: 'x',
        tier: 'single',
        source: { type: 'crawl' /* no url/reference */ },
      },
    ],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /source/i.test(e)));
});

test('invariant 4d: evidence without a claim text is rejected', () => {
  const r = validateEvidence({
    evidence: [{ tier: 'single', source: { type: 'crawl', url: 'u' } }],
  });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some((e) => /claim/i.test(e)));
});

test('valid evidence with a source (claim->source link) is accepted', () => {
  const r = validateEvidence({
    evidence: [
      {
        claim: 'Product 12345 has empty seo_title',
        tier: 'single',
        detail: 'Crawled product page on 2026-08-13, og:title missing.',
        source: { type: 'crawl', url: 'https://shop/catalog/x/y', retrieved_at: '2026-08-13' },
      },
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test('min tier threshold: weak-only evidence does not meet the "single" bar', () => {
  const ev = [{ tier: 'weak', source: { type: 'crawl', url: 'u' } }];
  assert.equal(meetsTierThreshold(ev, 'single'), false);
});

test('min tier threshold: at least one strong evidence satisfies the bar', () => {
  const ev = [
    { tier: 'weak', source: { type: 'crawl', url: 'u' } },
    { tier: 'authoritative', source: { type: 'official', url: 'u2' } },
  ];
  assert.equal(meetsTierThreshold(ev, 'single'), true);
});

test('validateEvidence honours an explicit minTier option', () => {
  const ev = [{ claim: 'x', tier: 'single', source: { type: 'crawl', url: 'u' } }];
  // single meets "single" but not "corroborated"
  assert.equal(validateEvidence({ evidence: ev, minTier: 'single' }).ok, true);
  assert.equal(validateEvidence({ evidence: ev, minTier: 'corroborated' }).ok, false);
});

test('a recommendation combining multiple evidence items all need valid sources', () => {
  const r = validateEvidence({
    evidence: [
      { claim: 'a', tier: 'single', source: { type: 'crawl', url: 'u1' } },
      { claim: 'b', tier: 'single' /* missing source */ },
    ],
  });
  assert.equal(r.ok, false);
});

test('each evidence item may carry a human-readable detail without breaking validation', () => {
  const r = validateEvidence({
    evidence: [
      {
        claim: 'Category page has no H1',
        tier: 'single',
        detail: 'No <h1> found in rendered HTML.',
        source: { type: 'crawl', url: 'u' },
      },
    ],
  });
  assert.equal(r.ok, true);
});

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
const fail = (message) => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const hash = (name) => crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex');
const normalize = (s) => s.toLocaleLowerCase('ru-RU').trim().replace(/\s+/gu, ' ');
const count = (s) => Number(String(s).replace(/[\s\u00a0]/gu, '').replace(',', '.'));
const parsePeriod = (period) => {
  const m = String(period).match(/(\d{2}\.\d{2}\.\d{4})\s*[–-]\s*(\d{2}\.\d{2}\.\d{4})\s*:\s*([\d\s\u00a0]+)/u);
  return m ? { start: m[1], end: m[2], total: count(m[3]) } : null;
};
const raw = read('raw/wordstat-observed.json');
const inventory = read('inventory.json');
const core = read('core.json');
const validation = read('validation.json');
const reportById = new Map(raw.reports.map((r,i) => [`WS${String(i+1).padStart(2,'0')}`, r]));
const knownUrls = new Set([
  'https://deere-shop.ru/catalog',
  ...inventory.categories.map(x=>x.url),
  ...inventory.product_samples.map(x=>x.url),
  ...Object.values(inventory.requested_sku_checks).map(x=>x.url).filter(Boolean),
  ...inventory.articles.map(x=>x.url),
]);
const expected = new Set();
let rawRows = 0, quotedReports = 0;
raw.reports.forEach((report) => {
  assert(report.region === 'Россия', `Non-Russia report: ${report.seed}`);
  assert(report.mode === undefined || report.mode === 'Popular', `Display mode must be Popular when present: ${report.seed}`);
  assert(report.mode_raw === undefined || report.mode_raw === 'table', `Unexpected raw Wordstat mode id: ${report.seed}`);
  assert(typeof report.url === 'string' && report.url.startsWith('https://wordstat.yandex.ru/?region=225&view=table&words='), `Invalid report URL: ${report.seed}`);
  for (const row of report.rows) {
    assert(Array.isArray(row) && row.length === 2 && typeof row[0] === 'string' && typeof row[1] === 'string', `Malformed row in ${report.seed}`);
    expected.add(normalize(row[0])); rawRows++;
  }
  if (/^".*"$/u.test(report.seed)) { expected.add(normalize(report.seed.slice(1,-1))); quotedReports++; }
});
assert(raw.reports.length === 88, `Expected 88 reports, got ${raw.reports.length}`);
assert(rawRows === 707, `Expected 707 raw rows, got ${rawRows}`);
assert(quotedReports === 14, `Expected 14 quoted measurements, got ${quotedReports}`);
assert(new Set(core.entries.map(e=>e.normalized_keyword)).size === core.entries.length, 'Duplicate normalized keyword in core.json');
assert(expected.size === 606, `Expected 606 distinct raw-row/quoted-seed keywords, got ${expected.size}`);
assert(expected.size === core.entries.length, `Keyword union mismatch: expected ${expected.size}, got ${core.entries.length}`);
for (const keyword of expected) assert(core.entries.some(e=>e.normalized_keyword===keyword), `Missing keyword: ${keyword}`);

const measureById = new Map(core.measurements.map(m=>[m.report_id,m]));
assert(measureById.size === raw.reports.length, 'Measurement table must contain one row per report');
for (const [id, report] of reportById) {
  const m = measureById.get(id), p = parsePeriod(report.period), quoted = /^".*"$/u.test(report.seed);
  assert(m && m.seed === report.seed && m.source_url === report.url && m.region === 'Россия', `Measurement provenance mismatch at ${id}`);
  assert(m.raw_period === report.period && m.period_start === (p?.start ?? null) && m.period_end === (p?.end ?? null), `Period provenance mismatch at ${id}`);
  assert(m.quoted_operator === quoted, `Quote operator mismatch at ${id}`);
  assert(m.header_total === (p?.total ?? null), `Header total mismatch at ${id}`);
  assert(m.measurement_scope === (quoted ? 'header phrase-word-count restriction only; not exact order or wordform' : 'header total for seed; do not equate with exact phrase frequency'), `Measurement scope mismatch at ${id}`);
}

for (const e of core.entries) {
  assert(e.region === 'Россия', `Wrong region for ${e.keyword}`);
  assert(e.source_report_ids.length > 0, `No source report provenance for ${e.keyword}`);
  for (const id of e.source_report_ids) assert(reportById.has(id), `Unknown source report ${id} for ${e.keyword}`);
  for (const id of e.listed_source_report_ids) {
    const report = reportById.get(id);
    assert(report && !/^".*"$/u.test(report.seed), `Quoted report used as broad listed frequency for ${e.keyword}`);
  }
  for (const id of e.quoted_source_report_ids) {
    const report = reportById.get(id);
    assert(report && /^".*"$/u.test(report.seed) && normalize(report.seed.slice(1,-1))===e.normalized_keyword, `Invalid quoted frequency source for ${e.keyword}`);
  }
  const observedListed = [];
  for (const o of e.listed_observations) {
    assert(o.source_report_ids?.length && o.source_urls?.length, `Listed observation lacks provenance: ${e.keyword}`);
    for (const id of o.source_report_ids) {
      const report=reportById.get(id), p=parsePeriod(report?.period || '');
      assert(report && !/^".*"$/u.test(report.seed), `Broad frequency cited quoted report ${id}`);
      assert(o.source_urls.includes(report.url), `Listed source URL mismatch ${e.keyword}/${id}`);
      assert(o.period_start===p?.start && o.period_end===p?.end, `Listed period mismatch ${e.keyword}/${id}`);
      assert(report.rows.some(([q,n])=>normalize(q)===e.normalized_keyword && count(n)===o.frequency), `Listed count not present in cited report for ${e.keyword}/${id}`);
      observedListed.push(`${id}|${o.frequency}|${o.period_start}|${o.period_end}`);
    }
  }
  for (const id of e.listed_source_report_ids) assert(observedListed.some(x=>x.startsWith(`${id}|`)), `Listed report id has no row provenance for ${e.keyword}/${id}`);
  for (const q of e.quoted_measurements) {
    const report=reportById.get(q.report_id), p=parsePeriod(report?.period || '');
    assert(report && /^".*"$/u.test(report.seed) && normalize(report.seed.slice(1,-1))===e.normalized_keyword, `Quoted measurement seed mismatch for ${e.keyword}`);
    assert(q.frequency===p?.total && q.source_url===report.url && q.raw_period===report.period, `Quoted header total provenance mismatch for ${e.keyword}`);
  }
  assert(JSON.stringify(e.quoted_frequency)===JSON.stringify(e.quoted_measurements.map(x=>x.frequency)), `Quoted values mixed or changed for ${e.keyword}`);
  assert(JSON.stringify(e.listed_frequency)===JSON.stringify(e.listed_observations.map(x=>x.frequency)), `Listed values mixed or changed for ${e.keyword}`);
  if (e.target_url) assert(knownUrls.has(e.target_url), `Target is not an inventoried route: ${e.keyword} -> ${e.target_url}`);
  if (e.target_status==='product_verified') {
    const found = Object.entries(inventory.requested_sku_checks).find(([requested, check]) => requested.toUpperCase()===String(check.jsonld_sku||'').toUpperCase() && check.url===e.target_url && e.sku_tokens.includes(requested.toUpperCase()));
    assert(found, `Product mapping lacks exact jsonld_sku match for ${e.keyword}`);
  }
  if (e.priority==='P1') {
    assert(e.bucket==='core' && e.target_url && ['mapped','product_verified'].includes(e.target_status), `Unsupported P1 target for ${e.keyword}`);
    assert(!/(совинтел|авито|avito|купить джон дир|купить john deere|^трактор|^комбайн|^сеялк|^жатк)/iu.test(e.keyword), `Unsupported demand classified P1: ${e.keyword}`);
    assert(e.sku_tokens.length===0 || e.target_status==='product_verified', `Unverified SKU got P1: ${e.keyword}`);
  }
}

const expectedIntentCases = [
  ['снятие форсунок джон дир 8', 'core', 'needs_review', ''],
  ['забивается сетка вентилятора радиаторов комбайн джон дир', 'core', 'needs_review', ''],
  ['джон дир форвардер пробило прокладку гбц', 'core', 'needs_review', ''],
  ['гильза поршин прокладки экскаватор джон дир 325к', 'core', 'needs_review', ''],
  ['запасные части джон дир', 'core', 'mapped', 'https://deere-shop.ru/catalog'],
  ['запасные части john deere', 'core', 'mapped', 'https://deere-shop.ru/catalog'],
  ['скачать мод на джон дир фс 25', 'excluded', 'excluded', ''],
  ['сеялка джон дир 1890 каталог запчастей скачать', 'core', 'needs_review', ''],
];
for (const [keyword, bucket, status, target] of expectedIntentCases) {
  const entry = core.entries.find(e => e.normalized_keyword === normalize(keyword));
  assert(entry && entry.bucket === bucket && entry.target_status === status && entry.target_url === target, `Intent regression: ${keyword}`);
}

for (const c of core.clusters) {
  const primary=core.entries.find(e=>e.normalized_keyword===normalize(c.primary_query));
  assert(primary && primary.bucket==='core', `Cluster primary absent from core: ${c.cluster}`);
  assert(primary.target_url===c.target_url && primary.target_status===c.target_status, `Cluster primary target/status mismatch: ${c.cluster}`);
  assert(c.method==='intent_only_provisional', `Cluster method is overstated: ${c.cluster}`);
  if (c.target_url) assert(knownUrls.has(c.target_url), `Unknown cluster target: ${c.target_url}`);
}

const shaRaw=hash('raw/wordstat-observed.json'), shaInventory=hash('inventory.json');
assert(core.metadata.raw_sha256===shaRaw && validation.raw_sha256===shaRaw, 'Raw source hash mismatch');
assert(core.metadata.inventory_sha256===shaInventory && validation.inventory_sha256===shaInventory, 'Inventory source hash mismatch');
for (const file of ['core.csv','core.json','excluded.csv','measurements.csv','clusters.csv','cluster-map.html']) {
  assert(validation.output_files.some(x=>x.file===file && x.sha256===hash(file)), `Output hash mismatch: ${file}`);
  assert(fs.readFileSync(path.join(dir,file)).subarray(0,3).equals(Buffer.from([0xef,0xbb,0xbf])) || file==='core.json' || file==='cluster-map.html', `CSV BOM missing: ${file}`);
}
assert(validation.source_rows===rawRows && validation.source_reports===raw.reports.length && validation.quoted_reports===quotedReports, 'Validation counts mismatch');
const html=fs.readFileSync(path.join(dir,'cluster-map.html'),'utf8');
assert(!html.includes('__DATA__') && html.includes('textContent') && !/https?:\/\/[^"']+\.js/iu.test(html), 'Cluster map is incomplete or uses an external script');
const embedded=html.match(/<script id="data" type="application\/json">([\s\S]*?)<\/script>/u);
const embeddedData=embedded && JSON.parse(embedded[1]);
assert(embeddedData && embeddedData.entries.length===core.entries.filter(e=>e.bucket==='core').length && embeddedData.metadata.excluded_count===core.entries.filter(e=>e.bucket==='excluded').length, 'Cluster map embedded data mismatch');
assert(raw.metadata.unusable_download?.status==='unusable' && raw.metadata.related_mode_note?.includes('not be interpreted as zero demand'), 'Raw metadata omits known Wordstat limitations');
const download=fs.readFileSync(path.join(dir,'raw/wordstat-01.csv'),'utf8').replace(/^\uFEFF/u,'').trimEnd().split(/\r?\n/u);
assert(download.length===1 && download[0].includes('21.09.2026') && raw.metadata.unusable_download.file==='wordstat-01.csv', 'Header-only download status or period changed');
assert(validation.period_window_count === new Set(core.measurements.map(m=>`${m.period_start}|${m.period_end}`)).size, 'Distinct period-window count mismatch');
console.log(JSON.stringify({status:'pass', reports:raw.reports.length, rows:rawRows, quoted_reports:quotedReports, distinct_keywords:expected.size, core:core.entries.filter(e=>e.bucket==='core').length, excluded:core.entries.filter(e=>e.bucket==='excluded').length, clusters:core.clusters.length, source_hashes:{raw:shaRaw,inventory:shaInventory}}));

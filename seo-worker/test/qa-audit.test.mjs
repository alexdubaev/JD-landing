import { test } from 'node:test';
import assert from 'node:assert/strict';
import { auditProducts, createDirectusProductPageReader } from '../src/qa-audit.mjs';
import { main } from '../src/cli.mjs';

function product(overrides = {}) {
  return {
    id: 1,
    slug: 'tractor-6155m',
    category: { slug: 'tractors' },
    seo_title: 'John Deere 6155M — DEERE-SHOP',
    seo_description: 'Подберите технику и комплектующие John Deere для задач вашего хозяйства с консультацией специалиста.',
    main_image: 'file-1',
    image_alt: 'Трактор John Deere 6155M',
    full_description: 'Подробное описание модели для подбора подходящего решения.',
    short_description: 'Краткое описание модели.',
    related_products: ['p-2'],
    ...overrides,
  };
}

test('auditProducts creates actionable tasks for every requested product QA finding', async () => {
  const result = await auditProducts({
    pageSize: 10,
    pageReader: async () => ({
      items: [
        product({
          seo_title: '',
          seo_description: '/Az служебный текст',
          main_image: null,
          image_alt: '',
          full_description: ' ',
          short_description: '',
          related_products: [],
        }),
      ],
    }),
  });

  assert.equal(result.scanned, 1);
  assert.deepEqual(
    result.tasks.map(({ reason, subtype, priority }) => ({ reason, subtype, priority })),
    [
      { reason: 'seo_title', subtype: 'missing', priority: 'high' },
      { reason: 'seo_description', subtype: 'leading_service_junk', priority: 'high' },
      { reason: 'seo_description', subtype: 'too_short', priority: 'medium' },
      { reason: 'image', subtype: 'missing', priority: 'medium' },
      { reason: 'image_alt', subtype: 'missing', priority: 'medium' },
      { reason: 'full_description', subtype: 'missing', priority: 'medium' },
      { reason: 'short_description', subtype: 'missing', priority: 'medium' },
      { reason: 'related_products', subtype: 'empty', priority: 'low' },
    ],
  );
  assert.deepEqual(result.tasks[0], {
    url: '/catalog/tractors/tractor-6155m',
    reason: 'seo_title',
    subtype: 'missing',
    currentValues: { seo_title: '' },
    priority: 'high',
  });
});

test('auditProducts flags duplicate titles across cursor pages and repeated DEERE-SHOP branding', async () => {
  const calls = [];
  const result = await auditProducts({
    pageSize: 1,
    pageReader: async ({ cursor }) => {
      calls.push(cursor ?? null);
      if (!cursor) {
        return {
          items: [product({ id: 1, slug: 'one', seo_title: 'Одинаковый title — DEERE-SHOP — DEERE-SHOP' })],
          nextCursor: 'next-page',
        };
      }
      return { items: [product({ id: 2, slug: 'two', seo_title: 'Одинаковый title — DEERE-SHOP — DEERE-SHOP' })] };
    },
  });

  assert.deepEqual(calls, [null, 'next-page']);
  assert.equal(result.scanned, 2);
  assert.deepEqual(
    result.tasks
      .map(({ url, reason, subtype, priority }) => ({ url, reason, subtype, priority }))
      .sort((a, b) => `${a.url}:${a.subtype}`.localeCompare(`${b.url}:${b.subtype}`)),
    [
      { url: '/catalog/tractors/one', reason: 'seo_title', subtype: 'duplicate', priority: 'high' },
      { url: '/catalog/tractors/two', reason: 'seo_title', subtype: 'duplicate', priority: 'high' },
      { url: '/catalog/tractors/one', reason: 'seo_title', subtype: 'repeated_brand', priority: 'medium' },
      { url: '/catalog/tractors/two', reason: 'seo_title', subtype: 'repeated_brand', priority: 'medium' },
    ].sort((a, b) => `${a.url}:${a.subtype}`.localeCompare(`${b.url}:${b.subtype}`)),
  );
});

test('auditProducts honours the product limit with page pagination', async () => {
  const pages = [];
  const result = await auditProducts({
    pageSize: 2,
    limit: 3,
    pageReader: async ({ page, pageSize }) => {
      pages.push({ page, pageSize });
      if (page === 0) return { items: [product({ id: 1 }), product({ id: 2, slug: 'two' })] };
      return { items: [product({ id: 3, slug: 'three' }), product({ id: 4, slug: 'four' })] };
    },
  });

  assert.equal(result.scanned, 3);
  assert.deepEqual(pages, [{ page: 0, pageSize: 2 }, { page: 1, pageSize: 2 }]);
});

test('createDirectusProductPageReader makes only paginated GET item reads', async () => {
  const reads = [];
  const reader = createDirectusProductPageReader({
    getItems: async (collection, query) => {
      reads.push({ collection, query });
      return [product()];
    },
    createItem: async () => { throw new Error('must not write'); },
    updateItem: async () => { throw new Error('must not write'); },
  });

  const response = await reader({ page: 2, pageSize: 25 });
  assert.equal(response.items.length, 1);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].collection, 'products');
  assert.equal(reads[0].query.limit, 25);
  assert.equal(reads[0].query.offset, 50);
});

test('CLI --dry-run emits a JSON QA report and does not require write mode', async () => {
  let output = '';
  const result = await main({
    argv: ['node', 'src/cli.mjs', '--dry-run', '--limit=1'],
    env: {},
    stdout: { write: (text) => { output += text; } },
    pageReader: async () => ({ items: [product({ seo_title: '' })] }),
  });

  const report = JSON.parse(output);
  assert.equal(result.action, 'qa_dry_run');
  assert.equal(result.written, false);
  assert.equal(report.scanned, 1);
  assert.deepEqual(report.tasks.map((task) => task.subtype), ['missing']);
});

test('CLI --dry-run returns a safe JSON error report when its page reader fails', async () => {
  let output = '';
  let writeCalls = 0;
  const result = await main({
    argv: ['node', 'src/cli.mjs', '--dry-run'],
    env: {},
    stdout: { write: (text) => { output += text; } },
    pageReader: async () => { throw new Error('upstream response included a secret'); },
    client: {
      createItem: async () => { writeCalls += 1; },
      updateItem: async () => { writeCalls += 1; },
    },
  });

  assert.equal(result.action, 'qa_dry_run');
  assert.equal(result.exitCode, 1);
  assert.equal(result.written, false);
  assert.equal(writeCalls, 0);
  assert.deepEqual(JSON.parse(output), {
    scanned: 0,
    tasks: [],
    error: 'QA dry-run failed',
  });
});

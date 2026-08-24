import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ARTICLE_SLUGS,
  buildBeforeState,
  collectJunctionIdsBySlug,
  convertArticleHtml,
  countDocumentNodes,
  evaluateArticles,
  extractRelationRefs,
  isSafeHref,
  runArticleContentMigration,
  runRestore,
  sha256Hex,
  validateContentDocument,
} from "./migrate-article-content.mjs";

// ---------------------------------------------------------------------------
// Representative HTML of the three production articles (patterns taken from
// the fallback sanitizer allowlist and the flexible-editor pilot fixtures):
// h2/h3/h4 headings, paragraphs, strong/em, links, ul/ol lists, tables,
// blockquote, entities, br.
// ---------------------------------------------------------------------------

const REALISTIC_ARTICLE_HTML = `<h2>Как подготовить данные для подбора запчасти John Deere</h2>
<p>Чтобы подобрать запчасть, соберите <strong>модель техники</strong>, серийный номер и
<em>фото таблички</em>. Проверить маркировку можно по
<a href="https://deere-shop.ru/articles/gde-iskat-artikul-i-markirovku-na-detali">инструкции</a>.</p>
<h3>Какие данные собрать</h3>
<ul>
  <li>модель и серийный номер машины;</li>
  <li>номер детали по каталогу — <a href="/catalog">каталог продукции</a>;</li>
  <li>фото маркировки и узла, где стоит деталь.</li>
</ul>
<h4>Пример сравнения муфт</h4>
<table>
  <thead>
    <tr><th>Параметр</th><th>Значение</th></tr>
  </thead>
  <tbody>
    <tr><td>Тип</td><td>электромагнитная муфта</td></tr>
    <tr><td>Применимость</td><td>серии 6M и 6R</td></tr>
  </tbody>
</table>
<blockquote><p>Уточняйте артикул у менеджера&nbsp;— он подтвердит применимость.</p></blockquote>
<ol>
  <li>Отправьте заявку.</li>
  <li>Получите подбор с ценами.</li>
</ol>
<p>Заявка&nbsp;— бесплатная консультация инженера.</p>`;

const text = (value, marks) =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };
const bold = [{ type: "bold" }];
const italic = [{ type: "italic" }];
const link = (href) => [{ type: "link", attrs: { href } }];

// ---------------------------------------------------------------------------
// Converter: nodes
// ---------------------------------------------------------------------------

test("converts h2/h3/h4 into heading nodes with levels", () => {
  assert.deepEqual(convertArticleHtml("<h2>A</h2><h3>B</h3><h4>C</h4>"), {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [text("A")] },
      { type: "heading", attrs: { level: 3 }, content: [text("B")] },
      { type: "heading", attrs: { level: 4 }, content: [text("C")] },
    ],
  });
});

test("H1 (and h5/h6) degrade to plain paragraphs — H1 is forbidden", () => {
  const doc = convertArticleHtml("<h1>Заголовок</h1><h5>Пять</h5><h6>Шесть</h6>");
  assert.deepEqual(
    doc.content.map(({ type }) => type),
    ["paragraph", "paragraph", "paragraph"],
  );
  assert.deepEqual(doc.content[0].content, [text("Заголовок")]);
});

test("strong/b and em/i become bold and italic marks, nesting preserved", () => {
  const doc = convertArticleHtml(
    "<p><strong>важный</strong> и <em>курсив</em> и <strong><em>оба</em></strong> и <b>жирный</b></p>",
  );
  assert.deepEqual(doc.content[0].content, [
    text("важный", bold),
    text(" и "),
    text("курсив", italic),
    text(" и "),
    text("оба", [{ type: "bold" }, { type: "italic" }]),
    text(" и "),
    text("жирный", bold),
  ]);
});

test("bullet and ordered lists become list nodes with paragraph items (pilot fixture shape)", () => {
  assert.deepEqual(
    convertArticleHtml("<ul><li>один</li><li>два</li></ul><ol><li>шаг</li></ol>"),
    {
      type: "doc",
      content: [
        {
          type: "bulletList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("один")] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [text("два")] }] },
          ],
        },
        {
          type: "orderedList",
          content: [
            { type: "listItem", content: [{ type: "paragraph", content: [text("шаг")] }] },
          ],
        },
      ],
    },
  );
});

test("nested lists stay inside the parent listItem in source order", () => {
  const doc = convertArticleHtml("<ul><li>родитель<ul><li>потомок</li></ul></li></ul>");
  assert.deepEqual(doc.content, [
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [text("родитель")] },
            {
              type: "bulletList",
              content: [
                { type: "listItem", content: [{ type: "paragraph", content: [text("потомок")] }] },
              ],
            },
          ],
        },
      ],
    },
  ]);
});

test("tables with thead/tbody become table rows with header and body cells", () => {
  const doc = convertArticleHtml(
    "<table><thead><tr><th>Параметр</th><th>Значение</th></tr></thead><tbody><tr><td>Тип</td><td>муфта</td></tr></tbody></table>",
  );
  assert.deepEqual(doc.content, [
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableHeader", content: [{ type: "paragraph", content: [text("Параметр")] }] },
            { type: "tableHeader", content: [{ type: "paragraph", content: [text("Значение")] }] },
          ],
        },
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: [{ type: "paragraph", content: [text("Тип")] }] },
            { type: "tableCell", content: [{ type: "paragraph", content: [text("муфта")] }] },
          ],
        },
      ],
    },
  ]);
});

test("blockquote wraps block content and keeps marks", () => {
  const doc = convertArticleHtml("<blockquote><p>цитата <strong>с ударением</strong></p></blockquote>");
  assert.deepEqual(doc.content, [
    {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [text("цитата "), text("с ударением", bold)] },
      ],
    },
  ]);
});

test("br becomes a hardBreak inline node", () => {
  const doc = convertArticleHtml("<p>строка одна<br>строка две</p>");
  assert.deepEqual(doc.content[0].content, [
    text("строка одна"),
    { type: "hardBreak" },
    text("строка две"),
  ]);
});

// ---------------------------------------------------------------------------
// Converter: degradation and safety
// ---------------------------------------------------------------------------

test("script and style content is dropped entirely, even with markup inside", () => {
  const doc = convertArticleHtml(
    '<p>до</p><script>alert("</p>")</script><style>p{color:red}</style><p>после</p>',
  );
  assert.deepEqual(
    doc.content.map(({ type, content }) => ({ type, text: content?.[0]?.text })),
    [
      { type: "paragraph", text: "до" },
      { type: "paragraph", text: "после" },
    ],
  );
});

test("unknown tags degrade to safe text without markup", () => {
  const doc = convertArticleHtml(
    '<figure><figcaption>Подпись</figcaption></figure><p>текст <span class="x">в спане</span></p>',
  );
  assert.deepEqual(doc.content, [
    { type: "paragraph", content: [text("Подпись")] },
    { type: "paragraph", content: [text("текст в спане")] },
  ]);
});

test("images and horizontal rules are dropped", () => {
  const doc = convertArticleHtml('<p>до</p><hr><img src="x"><p>после</p>');
  assert.equal(doc.content.length, 2);
});

test("entities decode: named (nbsp/laquo/raquo/mdash/amp) and numeric", () => {
  const doc = convertArticleHtml(
    "<p>Цена &laquo;1&nbsp;500&nbsp;руб.&raquo; &mdash; от &#8212; поставщика &amp; партнёров</p>",
  );
  assert.deepEqual(doc.content[0].content, [
    text("Цена «1 500 руб.» — от — поставщика & партнёров"),
  ]);
});

test("whitespace collapses, boundaries trim and no whitespace-only paragraphs remain", () => {
  const doc = convertArticleHtml(
    "<h2>\n  Заголовок  \n</h2>\n\n<p>\n  текст   один\n  два\n</p>\n",
  );
  assert.deepEqual(doc.content, [
    { type: "heading", attrs: { level: 2 }, content: [text("Заголовок")] },
    { type: "paragraph", content: [text("текст один два")] },
  ]);
});

test("adjacent text nodes with identical marks merge into one", () => {
  const doc = convertArticleHtml("<p><strong>жир</strong><strong>ный</strong></p>");
  assert.deepEqual(doc.content[0].content, [text("жирный", bold)]);
});

test("stray inline markup at block level is wrapped into a paragraph", () => {
  const doc = convertArticleHtml("<strong>внимание</strong>");
  assert.deepEqual(doc.content, [{ type: "paragraph", content: [text("внимание", bold)] }]);
});

test("empty and whitespace-only HTML convert to an empty document", () => {
  assert.deepEqual(convertArticleHtml(""), { type: "doc", content: [] });
  assert.deepEqual(convertArticleHtml("   \n  "), { type: "doc", content: [] });
  assert.deepEqual(convertArticleHtml(null), { type: "doc", content: [] });
});

// ---------------------------------------------------------------------------
// Converter: links
// ---------------------------------------------------------------------------

test("safe links become link marks; javascript:/data:/mailto: and missing href degrade to text", () => {
  const doc = convertArticleHtml(
    '<p><a href="https://deere-shop.ru/catalog">каталог</a> ' +
      '<a href="/catalog/tractors">внутренний</a> ' +
      '<a href="javascript:alert(1)">плохая</a> ' +
      '<a href="data:text/html,x">данные</a> ' +
      '<a href="mailto:sales@example.com">почта</a> ' +
      '<a>без href</a></p>',
  );
  const content = doc.content[0].content;
  assert.deepEqual(content[0], text("каталог", link("https://deere-shop.ru/catalog")));
  assert.deepEqual(content[2], text("внутренний", link("/catalog/tractors")));
  // The dropped-mark texts survive, merged into one plain run between the links.
  assert.deepEqual(content.length, 4);
  assert.deepEqual(content[1], text(" "));
  assert.deepEqual(content[3], text(" плохая данные почта без href"));
  assert.equal(content[3].marks, undefined);
});

test("obfuscated javascript: schemes (embedded whitespace/control chars) are dropped", () => {
  const doc = convertArticleHtml(
    '<p><a href="java\nscript:alert(1)">обфусцированная</a> ' +
      '<a href=" javascript:alert(2)">с пробелом</a></p>',
  );
  for (const node of doc.content[0].content) {
    assert.equal(node.marks, undefined, "no link mark survives");
  }
});

test("isSafeHref accepts http/https/relative and rejects everything else", () => {
  assert.equal(isSafeHref("https://deere-shop.ru"), true);
  assert.equal(isSafeHref("http://deere-shop.ru"), true);
  assert.equal(isSafeHref("HTTPS://DEERE-SHOP.RU"), true);
  assert.equal(isSafeHref("/catalog/tractors"), true);
  assert.equal(isSafeHref("#anchor"), true);
  assert.equal(isSafeHref("//cdn.example.com/x"), true);
  assert.equal(isSafeHref("javascript:alert(1)"), false);
  assert.equal(isSafeHref("data:text/html,x"), false);
  assert.equal(isSafeHref("vbscript:x"), false);
  assert.equal(isSafeHref("file:///etc/passwd"), false);
  assert.equal(isSafeHref("mailto:a@b.ru"), false);
  assert.equal(isSafeHref("java\nscript:alert(1)"), false);
  assert.equal(isSafeHref(""), false);
  assert.equal(isSafeHref(null), false);
});

// ---------------------------------------------------------------------------
// Converter: determinism and the flagship realistic fixture
// ---------------------------------------------------------------------------

test("identical HTML produces byte-identical JSON with a stable key order", () => {
  const first = JSON.stringify(convertArticleHtml(REALISTIC_ARTICLE_HTML));
  const second = JSON.stringify(convertArticleHtml(REALISTIC_ARTICLE_HTML));
  assert.equal(first, second);
  assert.ok(first.startsWith('{"type":"doc","content":['));
  assert.ok(first.includes('{"type":"heading","attrs":{"level":3}'));
});

test("converts the realistic article fixture into the exact canonical JSON", () => {
  assert.deepEqual(convertArticleHtml(REALISTIC_ARTICLE_HTML), {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 2 },
        content: [text("Как подготовить данные для подбора запчасти John Deere")],
      },
      {
        type: "paragraph",
        content: [
          text("Чтобы подобрать запчасть, соберите "),
          text("модель техники", bold),
          text(", серийный номер и "),
          text("фото таблички", italic),
          text(". Проверить маркировку можно по "),
          text(
            "инструкции",
            link("https://deere-shop.ru/articles/gde-iskat-artikul-i-markirovku-na-detali"),
          ),
          text("."),
        ],
      },
      { type: "heading", attrs: { level: 3 }, content: [text("Какие данные собрать")] },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [text("модель и серийный номер машины;")] }],
          },
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [
                  text("номер детали по каталогу — "),
                  text("каталог продукции", link("/catalog")),
                  text(";"),
                ],
              },
            ],
          },
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [text("фото маркировки и узла, где стоит деталь.")] },
            ],
          },
        ],
      },
      { type: "heading", attrs: { level: 4 }, content: [text("Пример сравнения муфт")] },
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              { type: "tableHeader", content: [{ type: "paragraph", content: [text("Параметр")] }] },
              { type: "tableHeader", content: [{ type: "paragraph", content: [text("Значение")] }] },
            ],
          },
          {
            type: "tableRow",
            content: [
              { type: "tableCell", content: [{ type: "paragraph", content: [text("Тип")] }] },
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [text("электромагнитная муфта")] }],
              },
            ],
          },
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                content: [{ type: "paragraph", content: [text("Применимость")] }],
              },
              { type: "tableCell", content: [{ type: "paragraph", content: [text("серии 6M и 6R")] }] },
            ],
          },
        ],
      },
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [text("Уточняйте артикул у менеджера — он подтвердит применимость.")],
          },
        ],
      },
      {
        type: "orderedList",
        content: [
          { type: "listItem", content: [{ type: "paragraph", content: [text("Отправьте заявку.")] }] },
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [text("Получите подбор с ценами.")] }],
          },
        ],
      },
      {
        type: "paragraph",
        content: [text("Заявка — бесплатная консультация инженера.")],
      },
    ],
  });
});

test("every converted fixture passes validateContentDocument without violations", () => {
  for (const html of [
    REALISTIC_ARTICLE_HTML,
    "<h2>A</h2>",
    "<h1>T</h1>",
    '<p><a href="javascript:x">bad</a></p>',
    "<ul><li>один</li></ul>",
    "<table><tr><td>x</td></tr></table>",
    "<blockquote><p>ц</p></blockquote>",
    "<p>a<br>b</p>",
  ]) {
    assert.deepEqual(validateContentDocument(convertArticleHtml(html)), [], html);
  }
});

// ---------------------------------------------------------------------------
// Validation and relation-ref helpers
// ---------------------------------------------------------------------------

test("validateContentDocument rejects invalid documents with precise codes", () => {
  assert.deepEqual(validateContentDocument(null), [{ code: "not-doc" }]);
  assert.deepEqual(validateContentDocument("not-a-document"), [{ code: "not-doc" }]);
  assert.deepEqual(
    validateContentDocument({ type: "paragraph", content: [] }),
    [{ code: "not-doc" }],
  );
  assert.deepEqual(validateContentDocument({ type: "doc" }), [{ code: "content-not-array" }]);
  assert.deepEqual(validateContentDocument({ type: "doc", content: [] }), [
    { code: "empty-content" },
  ]);
  assert.equal(
    validateContentDocument({ type: "doc", content: [{ type: "script" }] })[0].code,
    "unknown-node-type",
  );
  assert.equal(
    validateContentDocument({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 1 }, content: [] }],
    })[0].code,
    "invalid-heading-level",
  );
  assert.equal(
    validateContentDocument({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", marks: [{ type: "link", attrs: { href: "javascript:x" } }], text: "x" }] },
      ],
    })[0].code,
    "unsafe-link-href",
  );
  assert.equal(
    validateContentDocument({
      type: "doc",
      content: [{ type: "relationBlock", attrs: { id: "j", junction: "wrong", collection: "products" } }],
    })[0].code,
    "invalid-relation-junction",
  );
});

test("extractRelationRefs collects relation nodes and marks with junction and collection", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "relationBlock", attrs: { id: "j1", junction: "editor_nodes", collection: "products" } },
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            marks: [
              { type: "relationMark", attrs: { id: "j2", junction: "editor_nodes", collection: "categories" } },
            ],
            text: "CTA",
          },
        ],
      },
      { type: "relationInlineBlock", attrs: { id: "j3", junction: "editor_nodes", collection: "categories" } },
    ],
  };
  assert.deepEqual(extractRelationRefs(doc), [
    { id: "j1", junction: "editor_nodes", collection: "products" },
    { id: "j2", junction: "editor_nodes", collection: "categories" },
    { id: "j3", junction: "editor_nodes", collection: "categories" },
  ]);
  assert.deepEqual(extractRelationRefs(convertArticleHtml(REALISTIC_ARTICLE_HTML)), []);
});

test("countDocumentNodes counts every node except the doc root", () => {
  const counts = countDocumentNodes(convertArticleHtml("<p>a</p><p><strong>b</strong></p>"));
  assert.deepEqual(counts, {
    byType: { paragraph: 2, text: 2 },
    total: 4,
  });
});

test("sha256Hex matches the reference digest", () => {
  assert.equal(
    sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

// ---------------------------------------------------------------------------
// Migration orchestration (mock Directus client)
// ---------------------------------------------------------------------------

const ARTICLE_IDS = {
  "kak-podgotovit-dannye-dlya-podbora-zapchasti-john-deere":
    "a1000000-0000-4000-8000-000000000001",
  "gde-iskat-artikul-i-markirovku-na-detali": "a1000000-0000-4000-8000-000000000002",
  "chto-proverit-pered-zakazom-komplektuyuschih": "a1000000-0000-4000-8000-000000000003",
};

const TARGET_SLUG = ARTICLE_SLUGS[0];
const TARGET_ID = ARTICLE_IDS[TARGET_SLUG];
const OTHER_SLUG = ARTICLE_SLUGS[1];

const articleFixture = (slug, overrides = {}) => ({
  id: ARTICLE_IDS[slug],
  slug,
  title: `Статья ${slug}`,
  status: "published",
  seo_title: `SEO ${slug}`,
  seo_description: "Описание",
  content: `<h2>Заголовок статьи</h2><p>Текст <strong>статьи</strong> и <a href="/catalog">ссылка</a>.</p><ul><li>пункт</li></ul>`,
  ...overrides,
});

const productionArticles = () => ARTICLE_SLUGS.map((slug) => articleFixture(slug));

const mockClient = ({ articles = productionArticles(), junctions = [] } = {}) => {
  const state = {
    articles: new Map(articles.map((article) => [article.id, { ...article }])),
    junctions: new Map(junctions.map((row) => [row.id, { ...row }])),
  };
  const requests = [];
  const parse = (requestPath) => {
    const [pathname, search] = requestPath.split("?");
    return { pathname, params: new URLSearchParams(search ?? "") };
  };
  const matchesInFilter = (params, field, value) => {
    const raw = params.get(`filter[${field}][_in]`);
    return raw === null || raw.split(",").includes(value);
  };
  return {
    requests,
    state,
    async request(requestPath, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path: requestPath, method, body: options.body ?? null });
      const { pathname, params } = parse(requestPath);

      if (method === "GET" && pathname === "/items/articles") {
        return [...state.articles.values()]
          .filter((row) => matchesInFilter(params, "slug", row.slug))
          .toSorted((left, right) => left.slug.localeCompare(right.slug, "en"));
      }
      if (method === "GET" && pathname === "/items/articles_editor_nodes") {
        return [...state.junctions.values()].filter((row) =>
          matchesInFilter(params, "articles_id", row.articles_id),
        );
      }
      if (method === "PATCH" && pathname.startsWith("/items/articles/")) {
        const id = decodeURIComponent(pathname.split("/").pop());
        const article = state.articles.get(id);
        if (!article) throw new Error(`unknown article ${id}`);
        return Object.assign(article, JSON.parse(options.body));
      }
      if (method === "DELETE" && pathname.startsWith("/items/articles_editor_nodes/")) {
        const id = decodeURIComponent(pathname.split("/").pop());
        if (!state.junctions.delete(id)) throw new Error(`unknown junction ${id}`);
        return null;
      }
      throw new Error(`unexpected ${method} ${requestPath}`);
    },
  };
};

test("targets exactly the three production article slugs", () => {
  assert.deepEqual(ARTICLE_SLUGS, [
    "kak-podgotovit-dannye-dlya-podbora-zapchasti-john-deere",
    "gde-iskat-artikul-i-markirovku-na-detali",
    "chto-proverit-pered-zakazom-komplektuyuschih",
  ]);
});

test("evaluateArticles reports missing articles and empty content as blockers", () => {
  const ok = evaluateArticles(productionArticles());
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.blockers, []);

  const missingOne = productionArticles().slice(0, 2);
  const stopped = evaluateArticles(missingOne);
  assert.equal(stopped.ok, false);
  assert.ok(stopped.blockers.some(({ code }) => code === "missing-article"));
  assert.ok(stopped.blockers.some(({ code }) => code === "unexpected-article-count"));

  const empty = evaluateArticles([
    ...productionArticles().slice(0, 2),
    articleFixture(ARTICLE_SLUGS[2], { content: "   " }),
  ]);
  assert.ok(empty.blockers.some(({ code, slug }) => code === "empty-content" && slug === ARTICLE_SLUGS[2]));

  const extra = evaluateArticles([...productionArticles(), articleFixture("unknown-slug")]);
  assert.ok(extra.blockers.some(({ code }) => code === "unexpected-article"));
});

test("buildBeforeState records content sha256 and content_blocks=null per article", () => {
  const articles = productionArticles();
  const beforeState = buildBeforeState(articles);
  assert.equal(beforeState.length, 3);
  assert.deepEqual(
    beforeState.map(({ slug }) => slug),
    [...beforeState.map(({ slug }) => slug)].sort((left, right) => left.localeCompare(right, "en")),
  );
  for (const row of beforeState) {
    assert.deepEqual(Object.keys(row).sort(), ["content_blocks", "content_sha256", "id", "slug"]);
    assert.equal(row.content_blocks, null);
    assert.equal(row.content_sha256, sha256Hex(articles.find((a) => a.slug === row.slug).content));
  }
});

test("dry run (default) reads the three articles, plans nodes and performs no writes", async () => {
  const client = mockClient();
  const result = await runArticleContentMigration(client);

  assert.equal(result.ok, true);
  assert.equal(result.stopped, false);
  assert.equal(result.applied, false);
  assert.equal(result.migration, "article-content");
  assert.equal(result.beforeState.length, 3);
  assert.equal(result.articles.length, 3);
  for (const plan of result.articles) {
    assert.ok(plan.nodeCounts.total > 0, `${plan.slug} has nodes`);
    assert.equal(validateContentDocument(plan.content_blocks).length, 0);
    assert.deepEqual(plan.junctionIds, []);
  }
  assert.ok(client.requests.every(({ method }) => method === "GET"), "dry run never writes");
  assert.ok(
    client.requests.some(({ path, method }) =>
      method === "GET" && path.startsWith("/items/articles_editor_nodes?"),
    ),
    "dry run reads existing junction rows for the orphan report",
  );
});

test("STOPs with no writes when an article is missing", async () => {
  const articles = productionArticles().filter(({ slug }) => slug !== OTHER_SLUG);
  const client = mockClient({ articles });
  const result = await runArticleContentMigration(client, { apply: true, releaseId: "R5C-1" });

  assert.equal(result.ok, false);
  assert.equal(result.stopped, true);
  assert.ok(result.blockers.some(({ code }) => code === "missing-article"));
  assert.ok(
    client.requests.every(({ method }) => method === "GET"),
    "stopped before any write",
  );
});

test("STOPs when article HTML is empty", async () => {
  const articles = productionArticles().map((article) =>
    article.slug === TARGET_SLUG ? articleFixture(TARGET_SLUG, { content: " " }) : article,
  );
  const client = mockClient({ articles });
  const result = await runArticleContentMigration(client, { apply: true, releaseId: "R5C-1" });

  assert.equal(result.stopped, true);
  assert.ok(result.blockers.some(({ code, slug }) => code === "empty-content" && slug === TARGET_SLUG));
  assert.ok(client.requests.every(({ method }) => method === "GET"));
});

test("STOPs when non-empty HTML converts to an empty document", async () => {
  const articles = productionArticles().map((article) =>
    article.slug === TARGET_SLUG
      ? articleFixture(TARGET_SLUG, { content: "<script>only a script</script>" })
      : article,
  );
  const client = mockClient({ articles });
  const result = await runArticleContentMigration(client, { apply: true, releaseId: "R5C-1" });

  assert.equal(result.stopped, true);
  assert.ok(result.blockers.some(({ code, slug }) => code === "empty-document" && slug === TARGET_SLUG));
  assert.ok(client.requests.every(({ method }) => method === "GET"));
});

test("apply without --release-id is refused", async () => {
  const client = mockClient();
  await assert.rejects(() => runArticleContentMigration(client, { apply: true }), /release-id/i);
});

test("apply with an unknown --slug STOPs before any request", async () => {
  const client = mockClient();
  const result = await runArticleContentMigration(client, {
    apply: true,
    releaseId: "R5C-1",
    slug: "not-a-known-slug",
  });

  assert.equal(result.stopped, true);
  assert.ok(result.blockers.some(({ code }) => code === "unknown-slug"));
  assert.deepEqual(client.requests, []);
});

test("apply --slug patches exactly one article with ONLY content_blocks", async () => {
  const client = mockClient();
  const expected = articleFixture(TARGET_SLUG).content;
  const result = await runArticleContentMigration(client, {
    apply: true,
    releaseId: "R5C-2026-08-15",
    slug: TARGET_SLUG,
  });

  assert.equal(result.applied, true);
  assert.equal(result.releaseId, "R5C-2026-08-15");
  assert.equal(result.articles.length, 1);

  const patches = client.requests.filter(({ method, path }) =>
    method === "PATCH" && path.startsWith("/items/articles/"),
  );
  assert.equal(patches.length, 1);
  assert.equal(patches[0].path, `/items/articles/${TARGET_ID}`);
  const body = JSON.parse(patches[0].body);
  assert.deepEqual(Object.keys(body), ["content_blocks"]);
  assert.deepEqual(body.content_blocks, convertArticleHtml(expected));

  assert.equal(client.state.articles.get(TARGET_ID).content_blocks.type, "doc");
  for (const [id, article] of client.state.articles) {
    if (id !== TARGET_ID) {
      assert.equal(article.content_blocks, undefined, `${article.slug} untouched`);
      assert.equal(article.content, articleFixture(article.slug).content);
      assert.equal(article.status, "published");
    }
  }
  for (const method of ["POST", "PUT", "DELETE"]) {
    assert.equal(client.requests.some((entry) => entry.method === method), false);
  }
});

test("apply deletes stale junction rows of the target article BEFORE the patch", async () => {
  const staleOwn1 = "11111111-1111-4111-8111-111111111111";
  const staleOwn2 = "22222222-2222-4222-8222-222222222222";
  const foreign = "33333333-3333-4333-8333-333333333333";
  const client = mockClient({
    junctions: [
      { id: staleOwn1, articles_id: TARGET_ID, collection: "products", item: "p1" },
      { id: staleOwn2, articles_id: TARGET_ID, collection: "categories", item: "c1" },
      { id: foreign, articles_id: ARTICLE_IDS[OTHER_SLUG], collection: "products", item: "p2" },
    ],
  });
  const result = await runArticleContentMigration(client, {
    apply: true,
    releaseId: "R5C-1",
    slug: TARGET_SLUG,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.articles[0].staleJunctionIds.sort(), [staleOwn1, staleOwn2].sort());

  const deletes = client.requests.filter(({ method }) => method === "DELETE");
  assert.deepEqual(
    deletes.map(({ path }) => path.split("/").pop()).sort(),
    [staleOwn1, staleOwn2].sort(),
  );
  const patch = client.requests.find(({ method, path }) =>
    method === "PATCH" && path.startsWith("/items/articles/"),
  );
  for (const entry of deletes) {
    assert.ok(
      client.requests.indexOf(entry) < client.requests.indexOf(patch),
      "stale junctions are deleted before the content patch",
    );
  }
  assert.equal(client.state.junctions.has(foreign), true, "other articles' junctions untouched");
});

test("apply without --slug patches all three articles in slug order, one step each", async () => {
  const client = mockClient();
  const result = await runArticleContentMigration(client, { apply: true, releaseId: "R5C-1" });

  assert.equal(result.ok, true);
  assert.equal(result.articles.length, 3);
  const patches = client.requests.filter(({ method, path }) =>
    method === "PATCH" && path.startsWith("/items/articles/"),
  );
  assert.deepEqual(
    patches.map(({ path }) => path.split("/").pop()),
    ARTICLE_SLUGS.map((slug) => ARTICLE_IDS[slug]),
  );
  for (const entry of patches) {
    assert.deepEqual(Object.keys(JSON.parse(entry.body)), ["content_blocks"]);
  }
  for (const article of client.state.articles.values()) {
    assert.equal(article.content_blocks.type, "doc");
  }
});

test("every write stays inside articles.content_blocks and articles_editor_nodes", async () => {
  const client = mockClient({
    junctions: [{ id: "44444444-4444-4444-8444-444444444444", articles_id: TARGET_ID, collection: "products", item: "p" }],
  });
  await runArticleContentMigration(client, { apply: true, releaseId: "R5C-1", slug: TARGET_SLUG });

  for (const entry of client.requests.filter(({ method }) => method !== "GET")) {
    const allowed =
      (entry.method === "PATCH" && /^\/items\/articles\/[^/]+$/.test(entry.path)) ||
      (entry.method === "DELETE" && /^\/items\/articles_editor_nodes\/[^/]+$/.test(entry.path));
    assert.ok(allowed, `${entry.method} ${entry.path} is outside the allowed write surface`);
    if (entry.method === "PATCH") {
      assert.deepEqual(
        Object.keys(JSON.parse(entry.body)),
        ["content_blocks"],
        "PATCH payload carries only content_blocks — content, slug, status and SEO are read-only",
      );
    }
  }
});

// ---------------------------------------------------------------------------
// Restore
// ---------------------------------------------------------------------------

test("restore nulls content_blocks of the requested article and deletes only plan-listed junction rows", async () => {
  const ownedJunction = "55555555-5555-4555-8555-555555555555";
  const foreignJunction = "66666666-6666-4666-8666-666666666666";
  const client = mockClient({
    junctions: [
      { id: ownedJunction, articles_id: TARGET_ID, collection: "products", item: "p" },
      { id: foreignJunction, articles_id: ARTICLE_IDS[OTHER_SLUG], collection: "products", item: "p" },
    ],
  });
  for (const article of client.state.articles.values()) {
    article.content_blocks = convertArticleHtml(article.content);
  }
  const beforeState = buildBeforeState(productionArticles());
  const result = await runRestore(client, beforeState, {
    apply: true,
    slug: TARGET_SLUG,
    junctionIdsByArticle: { [TARGET_SLUG]: [ownedJunction] },
  });

  assert.equal(result.applied, true);
  assert.equal(result.slug, TARGET_SLUG);
  const patches = client.requests.filter(({ method }) => method === "PATCH");
  assert.equal(patches.length, 1);
  assert.equal(patches[0].path, `/items/articles/${TARGET_ID}`);
  assert.deepEqual(JSON.parse(patches[0].body), { content_blocks: null });

  const deletes = client.requests.filter(({ method }) => method === "DELETE");
  assert.deepEqual(deletes.map(({ path }) => path.split("/").pop()), [ownedJunction]);

  assert.equal(client.state.articles.get(TARGET_ID).content_blocks, null);
  assert.notEqual(client.state.articles.get(ARTICLE_IDS[OTHER_SLUG]).content_blocks, null);
  assert.equal(client.state.junctions.has(foreignJunction), true);
});

test("restore requires --slug and exactly one matching before-state row", async () => {
  const client = mockClient();
  const beforeState = buildBeforeState(productionArticles());
  await assert.rejects(
    () => runRestore(client, beforeState, { apply: true }),
    /--slug/,
  );
  await assert.rejects(
    () => runRestore(client, beforeState.filter((row) => row.slug !== TARGET_SLUG), {
      apply: true,
      slug: TARGET_SLUG,
    }),
    /exactly one/,
  );
});

test("restore without --apply plans the rollback without writing", async () => {
  const client = mockClient();
  const beforeState = buildBeforeState(productionArticles());
  const result = await runRestore(client, beforeState, {
    apply: false,
    slug: TARGET_SLUG,
    junctionIdsByArticle: { [TARGET_SLUG]: [] },
  });
  assert.equal(result.applied, false);
  assert.deepEqual(client.requests, []);
});

test("collectJunctionIdsBySlug reads junction ids per slug from a plan artifact", () => {
  const map = collectJunctionIdsBySlug({
    articles: [
      { slug: "a", junctionIds: ["1", 2, "3"] },
      { slug: "b" },
      { slug: "c", junctionIds: [] },
    ],
  });
  assert.deepEqual(map, { a: ["1", "3"], b: [], c: [] });
  assert.deepEqual(collectJunctionIdsBySlug(null), {});
});

test("package.json exposes the migrations:article-content script", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts["migrations:article-content"],
    "node migrations/migrate-article-content.mjs",
  );
});

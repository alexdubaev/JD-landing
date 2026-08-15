import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  ARTICLE_SLUGS,
  convertArticleHtml,
  sha256Hex,
} from "./migrate-article-content.mjs";
import { reconcileArticleContent } from "./reconcile-article-content.mjs";

const ARTICLES = ARTICLE_SLUGS.map((slug, index) => ({
  id: `a2000000-0000-4000-8000-00000000000${index + 1}`,
  slug,
  content: `<h2>Заголовок ${slug}</h2><p>Текст <strong>статьи</strong>.</p>`,
}));

const mockClient = ({ articles = ARTICLES, junctions = [] } = {}) => {
  const state = {
    articles: new Map(articles.map((article) => [article.id, { ...article }])),
    junctions: new Map(junctions.map((row) => [row.id, { ...row }])),
  };
  const requests = [];
  return {
    requests,
    state,
    async request(requestPath, options = {}) {
      const method = options.method ?? "GET";
      requests.push({ path: requestPath, method });
      const [pathname, search] = requestPath.split("?");
      const params = new URLSearchParams(search ?? "");
      if (method === "GET" && pathname.startsWith("/items/articles/")) {
        const id = decodeURIComponent(pathname.split("/").pop());
        const article = state.articles.get(id);
        return article ? [article] : [];
      }
      if (method === "GET" && pathname === "/items/articles_editor_nodes") {
        const want = params.get("filter[articles_id][_eq]");
        return [...state.junctions.values()].filter(
          (row) => want === null || row.articles_id === want,
        );
      }
      throw new Error(`unexpected ${method} ${requestPath}`);
    },
  };
};

const beforeState = () =>
  ARTICLES.map(({ id, slug, content }) => ({
    slug,
    id,
    content_sha256: sha256Hex(content),
    content_blocks: null,
  }));

const appliedArticles = () =>
  ARTICLES.map((article) => ({
    ...article,
    content_blocks: convertArticleHtml(article.content),
  }));

const plan = () => ({
  articles: ARTICLE_SLUGS.map((slug) => ({ slug, junctionIds: [] })),
});

test("reconcile passes a clean cutover state", async () => {
  const client = mockClient({ articles: appliedArticles() });
  const result = await reconcileArticleContent(client, {
    beforeState: beforeState(),
    plan: plan(),
  });
  assert.equal(result.ok, true, JSON.stringify(result.violations));
  assert.equal(result.articles.length, 3);
  assert.ok(client.requests.every(({ method }) => method === "GET"));
});

test("flags content edits made after the before-state", async () => {
  const edited = appliedArticles().map((article, index) =>
    index === 0 ? { ...article, content: article.content + "<p>новый</p>" } : article,
  );
  const result = await reconcileArticleContent(mockClient({ articles: edited }), {
    beforeState: beforeState(),
    plan: plan(),
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations.some(({ code, slug }) => code === "content-changed" && slug === ARTICLE_SLUGS[0]));
});

test("flags invalid or missing content_blocks", async () => {
  const broken = appliedArticles().map((article, index) =>
    index === 1 ? { ...article, content_blocks: null } : article,
  );
  const result = await reconcileArticleContent(mockClient({ articles: broken }), {
    beforeState: beforeState(),
    plan: plan(),
  });
  assert.ok(result.violations.some(({ code }) => code === "invalid-content-blocks"));
});

test("flags orphan junction rows and dangling relation refs", async () => {
  const target = ARTICLES[0];
  const orphan = { id: "99999999-9999-4999-8999-999999999999", articles_id: target.id, collection: "products", item: "p" };
  const result = await reconcileArticleContent(
    mockClient({ articles: appliedArticles(), junctions: [orphan] }),
    { beforeState: beforeState(), plan: plan() },
  );
  assert.ok(result.violations.some(({ code }) => code === "orphan-junction"));
});

test("flags a missing before-state row", async () => {
  const result = await reconcileArticleContent(mockClient({ articles: appliedArticles() }), {
    beforeState: beforeState().filter((row) => row.slug !== ARTICLE_SLUGS[2]),
    plan: plan(),
  });
  assert.ok(result.violations.some(({ code, slug }) => code === "missing-before-state" && slug === ARTICLE_SLUGS[2]));
});

test("package.json exposes the reconcile script", async () => {
  const packageJson = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    packageJson.scripts["migrations:article-content-reconcile"],
    "node migrations/reconcile-article-content.mjs",
  );
});

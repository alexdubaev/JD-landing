import { Fragment, type ReactNode } from "react";

import { sanitizeArticleHtml } from "@/lib/articles/sanitize";
import {
  isSafeUrl,
  parseStructuredContent,
  type BlockNode,
  type ContentDocument,
  type CtaVariant,
  type InlineNode,
  type RelationKind,
  type RelationResolver,
  type RelationResolverContext,
  type TextMark,
} from "@/lib/articles/structured-content";

/**
 * Dependency-free recursive React renderer for structured article content.
 *
 * It reads `content_blocks` (Directus Flexible Editor JSON) first and falls
 * back to the existing {@link sanitizeArticleHtml} HTML path when the JSON is
 * absent or structurally invalid. The renderer is a pure function of its props
 * (no hooks, no client-only APIs, no Directus I/O) so it can run as a Server
 * Component.
 *
 * Security and contract rules (see
 * docs/superpowers/specs/2026-08-13-directus-admin-reversible-architecture-design.md,
 * "Article body"):
 *  - Only nodes on the explicit allowlist (enforced by the parser) are
 *    rendered. Unknown / corrupted nodes become a non-executable diagnostic in
 *    preview and nothing in public.
 *  - H1 is disabled; only H2-H4 render as headings.
 *  - Relation nodes carry only a reference. Title, price, slug and URL are
 *    resolved at render time through the injectable {@link RelationResolver}.
 *  - All `href`s (inline links and resolved relations) are re-validated with
 *    {@link isSafeUrl}; unsafe values are never written to the DOM. No
 *    `dangerouslySetInnerHTML` is used on the structured path — only on the
 *    sanitized HTML fallback.
 *
 * Wiring (Agent RC) supplies `resolveRelation` after pre-fetching the
 * referenced entities with bounded Directus fields/deep/limit.
 */

export interface ArticleContentProps {
  /** Raw `articles.content_blocks` JSON (nullable Flexible Editor output). */
  contentBlocks: unknown;
  /** Legacy `articles.content` HTML, used when structured JSON is unavailable. */
  htmlFallback?: string;
  /** `"public"` (default) hides diagnostics; `"preview"` shows them. */
  mode?: "public" | "preview";
  /** Resolves product/category/CTA references to renderable data. */
  resolveRelation?: RelationResolver;
  /** Wrapper class; defaults to `article-content`. */
  className?: string;
}

export function ArticleContent({
  contentBlocks,
  htmlFallback,
  mode = "public",
  resolveRelation,
  className,
}: ArticleContentProps): ReactNode {
  const wrapperClass = className ?? "article-content";
  const result = parseStructuredContent(contentBlocks);

  if (!result.ok) {
    const html = htmlFallback ? sanitizeArticleHtml(htmlFallback) : "";
    if (html.length === 0) {
      return null;
    }
    return (
      <div
        className={wrapperClass}
        // html is the output of sanitizeArticleHtml (sanitize-html), which
        // strips scripts, event handlers and unsafe URLs. This is the only
        // path that uses dangerouslySetInnerHTML; the structured path never
        // executes raw HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={wrapperClass}>
      <StructuredBody
        document={result.document}
        mode={mode}
        resolveRelation={resolveRelation}
      />
    </div>
  );
}

interface BodyProps {
  document: ContentDocument;
  mode: "public" | "preview";
  resolveRelation?: RelationResolver;
}

function StructuredBody({ document, mode, resolveRelation }: BodyProps): ReactNode {
  return document.content.map((node, index) =>
    renderBlock(node, index, { mode, resolveRelation }),
  );
}

interface RenderContext {
  mode: "public" | "preview";
  resolveRelation?: RelationResolver;
}

function renderBlock(node: BlockNode, key: number, ctx: RenderContext): ReactNode {
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key}>{renderInlineList(node.content)}</p>
      );
    case "heading": {
      const Tag = (`h${node.attrs.level}` as "h2" | "h3" | "h4");
      return <Tag key={key}>{renderInlineList(node.content)}</Tag>;
    }
    case "bulletList":
      return (
        <ul key={key}>
          {node.content.map((item, i) => (
            <li key={i}>{item.content.map((child, j) => renderBlock(child, j, ctx))}</li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol key={key}>
          {node.content.map((item, i) => (
            <li key={i}>{item.content.map((child, j) => renderBlock(child, j, ctx))}</li>
          ))}
        </ol>
      );
    case "blockquote":
      return (
        <blockquote key={key}>
          {node.content.map((child, i) => renderBlock(child, i, ctx))}
        </blockquote>
      );
    case "table":
      return (
        <table key={key} className="article-content__table">
          <tbody>
            {node.content.map((row, i) => (
              <tr key={i}>
                {row.content.map((cell, j) => {
                  const CellTag = cell.type === "tableHeader" ? "th" : "td";
                  return (
                    <CellTag key={j}>
                      {cell.content.map((child, k) => renderBlock(child, k, ctx))}
                    </CellTag>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case "productRelation":
      return renderRelation(
        { kind: "product", id: node.attrs.id },
        key,
        ctx,
      );
    case "categoryRelation":
      return renderRelation(
        { kind: "category", id: node.attrs.id },
        key,
        ctx,
      );
    case "ctaRelation":
      return renderRelation(
        { kind: "cta", id: node.attrs.id },
        key,
        ctx,
        { nodeLabel: node.attrs.label, nodeVariant: node.attrs.variant },
      );
    case "unknown":
      return renderUnknown(node.originalType, key, ctx);
  }
}

function renderInlineList(content: readonly InlineNode[] | undefined): ReactNode {
  if (!content || content.length === 0) {
    return null;
  }
  return content.map((node, index) => {
    if (node.type === "hardBreak") {
      return <br key={index} />;
    }
    return (
      <Fragment key={index}>{renderText(node.text, node.marks)}</Fragment>
    );
  });
}

function renderText(text: string, marks: TextMark[] | undefined): ReactNode {
  let rendered: ReactNode = text;
  if (!marks || marks.length === 0) {
    return rendered;
  }
  if (marks.some((m) => m.type === "italic")) {
    rendered = <em>{rendered}</em>;
  }
  if (marks.some((m) => m.type === "bold")) {
    rendered = <strong>{rendered}</strong>;
  }
  const link = marks.find(
    (m): m is Extract<TextMark, { type: "link" }> => m.type === "link",
  );
  if (link && isSafeUrl(link.attrs.href)) {
    rendered = (
      <a href={link.attrs.href} rel={linkRel(link.attrs.href)}>
        {rendered}
      </a>
    );
  }
  return rendered;
}

/**
 * Absolute http/https links are hardened with `rel="nofollow noopener
 * noreferrer"` (matching the sanitized HTML fallback). Relative paths,
 * anchors, `mailto:` and `tel:` are internal/safe and left untouched.
 */
function linkRel(href: string): string | undefined {
  if (/^https?:\/\//i.test(href)) {
    return "nofollow noopener noreferrer";
  }
  return undefined;
}

function renderRelation(
  ref: { kind: RelationKind; id: string },
  key: number,
  ctx: RenderContext,
  nodeContext?: RelationResolverContext,
): ReactNode {
  const resolved = ctx.resolveRelation?.(ref, nodeContext);
  if (!resolved) {
    if (ctx.mode === "preview") {
      return (
        <Diagnostic key={key}>
          {`Не удалось разрешить связь: ${ref.kind} (${ref.id})`}
        </Diagnostic>
      );
    }
    return null;
  }
  switch (resolved.kind) {
    case "product":
      return <ProductCard key={key} data={resolved} />;
    case "category":
      return <CategoryCard key={key} data={resolved} />;
    case "cta":
      return <CtaButton key={key} data={resolved} />;
  }
}

function ProductCard({
  data,
}: {
  data: {
    title: string;
    url: string;
    priceLabel?: string;
    imageUrl?: string;
    imageAlt?: string;
  };
}): ReactNode {
  const href = isSafeUrl(data.url) ? data.url : null;
  const image = data.imageUrl && isSafeUrl(data.imageUrl) ? data.imageUrl : null;
  const inner = (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={data.imageAlt ?? ""}
          className="article-content__relation-image"
          loading="lazy"
          src={image}
        />
      ) : null}
      <span className="article-content__relation-title">{data.title}</span>
      {data.priceLabel ? (
        <span className="article-content__relation-meta">{data.priceLabel}</span>
      ) : null}
    </>
  );
  if (href === null) {
    return <div className="article-content__relation article-content__relation--product">{inner}</div>;
  }
  return (
    <a
      className="article-content__relation article-content__relation--product"
      href={href}
    >
      {inner}
    </a>
  );
}

function CategoryCard({
  data,
}: {
  data: { title: string; url: string; imageUrl?: string; imageAlt?: string };
}): ReactNode {
  const href = isSafeUrl(data.url) ? data.url : null;
  const image = data.imageUrl && isSafeUrl(data.imageUrl) ? data.imageUrl : null;
  const inner = (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt={data.imageAlt ?? ""}
          className="article-content__relation-image"
          loading="lazy"
          src={image}
        />
      ) : null}
      <span className="article-content__relation-title">{data.title}</span>
    </>
  );
  if (href === null) {
    return <div className="article-content__relation article-content__relation--category">{inner}</div>;
  }
  return (
    <a
      className="article-content__relation article-content__relation--category"
      href={href}
    >
      {inner}
    </a>
  );
}

function CtaButton({
  data,
}: {
  data: { label: string; url: string; variant?: CtaVariant };
}): ReactNode {
  const href = isSafeUrl(data.url) ? data.url : null;
  if (href === null) {
    return null;
  }
  const variant = data.variant ?? "primary";
  return (
    <a
      className={`article-content__cta article-content__cta--${variant}`}
      href={href}
      rel={linkRel(href)}
    >
      {data.label}
    </a>
  );
}

function renderUnknown(
  originalType: string | null,
  key: number,
  ctx: RenderContext,
): ReactNode {
  if (ctx.mode !== "preview") {
    return null;
  }
  const label =
    originalType !== null
      ? `Неизвестный или недопустимый узел: «${originalType}»`
      : "Неизвестный или недопустимый узел";
  return <Diagnostic key={key}>{label}</Diagnostic>;
}

function Diagnostic({ children }: { children: ReactNode }): ReactNode {
  return (
    <div role="alert" className="article-content__diagnostic">
      {children}
    </div>
  );
}

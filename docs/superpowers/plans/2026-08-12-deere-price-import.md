# Deere Price Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the supplier price CSV into a Directus-compatible draft catalog CSV while excluding every SKU already published on the local site.

**Architecture:** Read the semicolon-delimited supplier file and obtain the current SKU set from the local Directus API. Normalize article numbers for comparison, then transform remaining records to the current catalog export schema. Apply deterministic title-based category heuristics, preserve numeric RUB prices, and create truthful SEO metadata only from source title and descriptions.

**Tech Stack:** Node.js, `@oai/artifact-tool` for CSV inspection/visual verification, Directus REST API, UTF-8 CSV.

## Global Constraints

- Do not expose Directus credentials or tokens.
- Output every new item as `draft` and preserve source RUB prices as fixed prices.
- Do not claim official John Deere representation or invent product facts.
- Use only existing catalog category slugs; unresolved records go to `prochie-detali-john-deere`.
- Never alter the source price CSV or existing site products.

---

### Task 1: Build the import dataset

**Files:**

- Create: `outputs/deere-supplier-import-2026-08-12/catalog-products-import.csv`
- Create: `outputs/deere-supplier-import-2026-08-12/category-summary.csv`

**Interfaces:**

- Consumes: supplier columns `Артикул`, `Товар`, `Краткое описание`, `Описание`, `Цена`, `Количество`, and `Производитель`.
- Consumes: Directus `products` values `sku,status`.
- Produces: the current 34-column editable catalog schema with a blank `product_id` for new records.

- [ ] **Step 1: Read source and current SKU data**

  Normalize every SKU by trimming, uppercasing, and removing whitespace or hyphens. Treat matching normalized values as existing site products.

- [ ] **Step 2: Transform only non-existing products**

  Keep the supplier price only when it parses as a positive number; write `RUB`, `fixed`, `on_request`, `draft`, `John Deere`, and empty image/document-specific fields. Generate a unique URL slug from the Russian product title and SKU.

- [ ] **Step 3: Assign categories and write metadata**

  Match component terminology in title and description to the 18 live category slugs, otherwise assign `prochie-detali-john-deere`. Write concise title, description, and image-alt metadata using only source content and the article number.

### Task 2: Verify deliverables

**Files:**

- Test: `outputs/deere-supplier-import-2026-08-12/catalog-products-import.csv`
- Test: `outputs/deere-supplier-import-2026-08-12/category-summary.csv`

**Interfaces:**

- Consumes: generated import CSV and the live Directus SKU index.
- Produces: a validated import package with a category count summary.

- [ ] **Step 1: Validate data invariants**

  Verify the output header exactly matches the current editable catalog export, all SKUs and slugs are unique, no output SKU matches a live SKU after normalization, all prices are numeric and positive, and every row has a non-empty category, title, description, SEO title, and SEO description.

- [ ] **Step 2: Inspect a representative sample**

  Import the CSV through `@oai/artifact-tool`, inspect the header and first rows, and render a compact sample image to confirm UTF-8 content is readable.

- [ ] **Step 3: Report import counts**

  Reconcile total source records = excluded existing SKUs + output records and report category distribution plus any fallback assignments.

\pset tuples_only on
\pset format unaligned
\pset fieldsep '|'

SELECT
  'products',
  count(*),
  count(DISTINCT sku),
  count(DISTINCT slug),
  count(*) FILTER (WHERE category IS NULL),
  count(*) FILTER (WHERE main_image IS NULL),
  count(*) FILTER (WHERE status != 'draft'),
  count(*) FILTER (WHERE full_description ILIKE '%Авито%')
FROM products;

SELECT
  'catalog',
  (SELECT count(*) FROM categories),
  (SELECT count(*) FROM directus_files WHERE title LIKE 'jd-import/%'),
  (SELECT coalesce(sum(jsonb_array_length(gallery::jsonb)), 0) FROM products);

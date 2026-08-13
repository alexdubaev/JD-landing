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
  count(*) FILTER (WHERE status = 'published'),
  count(*) FILTER (
    WHERE jsonb_typeof(coalesce(gallery::jsonb, '[]'::jsonb)) = 'array'
      AND jsonb_array_length(coalesce(gallery::jsonb, '[]'::jsonb)) > 0
  ),
  coalesce(sum(
    CASE
      WHEN jsonb_typeof(coalesce(gallery::jsonb, '[]'::jsonb)) = 'array'
        THEN jsonb_array_length(coalesce(gallery::jsonb, '[]'::jsonb))
      ELSE 0
    END
  ), 0),
  count(*) FILTER (WHERE full_description ILIKE '%Авито%')
FROM products;

SELECT
  'catalog',
  (SELECT count(*) FROM categories),
  (SELECT count(*) FROM directus_files WHERE title LIKE 'jd-import/%'),
  (SELECT count(*) FROM articles),
  (SELECT count(*) FROM pages),
  (SELECT count(*) FROM page_sections),
  (SELECT count(*) FROM faq_items),
  (SELECT count(*) FROM leads),
  (SELECT count(*) FROM orders);

SELECT
  'broken_relations',
  (SELECT count(*) FROM products p LEFT JOIN categories c ON c.id = p.category WHERE p.category IS NOT NULL AND c.id IS NULL),
  (SELECT count(*) FROM categories c LEFT JOIN categories parent ON parent.id = c.parent WHERE c.parent IS NOT NULL AND parent.id IS NULL),
  (
    SELECT count(*)
    FROM page_sections ps
    LEFT JOIN pages pg ON pg.id = ps.page
    WHERE ps.page IS NOT NULL AND pg.id IS NULL
  ),
  (SELECT count(*) FROM page_sections ps LEFT JOIN home_page hp ON hp.id = ps.home_page WHERE ps.home_page IS NOT NULL AND hp.id IS NULL),
  (SELECT count(*) FROM faq_items f LEFT JOIN pages p ON p.id = f.page WHERE f.page IS NOT NULL AND p.id IS NULL),
  (SELECT count(*) FROM faq_items f LEFT JOIN categories c ON c.id = f.category WHERE f.category IS NOT NULL AND c.id IS NULL),
  (SELECT count(*) FROM faq_items f LEFT JOIN products p ON p.id = f.product WHERE f.product IS NOT NULL AND p.id IS NULL);

SELECT
  'project_collections',
  count(*)
FROM directus_collections dc
JOIN information_schema.tables t
  ON t.table_schema = current_schema()
 AND t.table_name = dc.collection
 AND t.table_type = 'BASE TABLE'
WHERE dc.collection NOT LIKE 'directus\_%' ESCAPE '\';

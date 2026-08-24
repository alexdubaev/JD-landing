const stateStyle = {
  padding: "16px",
  color: "var(--theme--foreground-subdued, #65746c)",
  background: "var(--theme--background-subdued, #f4f6f5)",
  borderRadius: "var(--theme--border-radius, 6px)",
};

export const buildGalleryRequest = (primaryKey) => ({
  params: {
    filter: { product: { _eq: primaryKey } },
    fields: [
      "id",
      "sort_order",
      "alt_text",
      "image.id",
      "image.title",
      "image.filename_download",
      "image.modified_on",
    ],
    sort: ["sort_order"],
    limit: -1,
  },
});

const assetUrl = (file) => {
  const params = new URLSearchParams({
    width: "720",
    height: "540",
    fit: "contain",
    withoutEnlargement: "true",
    quality: "85",
    format: "auto",
  });
  if (file.modified_on) params.set("v", String(file.modified_on));
  return `/assets/${encodeURIComponent(file.id)}?${params.toString()}`;
};

const stateVNode = (h, message) => h("div", { style: stateStyle }, message);

export function createGalleryPreviewVNode(
  h,
  rows,
  { loading = false, error = null } = {},
) {
  if (loading) return stateVNode(h, "Загружаем изображения галереи…");
  if (error) return stateVNode(h, "Не удалось загрузить изображения галереи.");

  const cards = (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.image?.id)
    .map((row) => {
      const file = row.image;
      const filename = file.filename_download || file.title || "Изображение товара";
      const alt = row.alt_text || file.title || filename;
      return h(
        "figure",
        {
          key: row.id ?? file.id,
          style: {
            margin: "0",
            padding: "12px",
            minWidth: "0",
            background: "var(--theme--background-normal, #fff)",
            border: "1px solid var(--theme--border-color-subdued, #dfe6e2)",
            borderRadius: "var(--theme--border-radius, 6px)",
          },
        },
        [
          h("img", {
            src: assetUrl(file),
            alt,
            loading: "lazy",
            style: {
              display: "block",
              width: "100%",
              height: "180px",
              objectFit: "contain",
              background: "var(--theme--background-subdued, #f4f6f5)",
              borderRadius: "var(--theme--border-radius, 6px)",
            },
          }),
          h(
            "figcaption",
            {
              style: {
                marginTop: "8px",
                overflow: "hidden",
                color: "var(--theme--foreground-subdued, #5f6e66)",
                fontSize: "12px",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            },
            filename,
          ),
        ],
      );
    });

  if (cards.length === 0) {
    return stateVNode(h, "У этого товара пока нет изображений в галерее.");
  }

  return h(
    "div",
    {
      class: "deere-shop-gallery-preview",
      style: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        gap: "12px",
        width: "100%",
      },
    },
    cards,
  );
}

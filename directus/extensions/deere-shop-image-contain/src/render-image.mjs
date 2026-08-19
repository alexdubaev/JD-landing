const emptyStyle = {
  color: "var(--theme--foreground-subdued, #819188)",
  fontStyle: "italic",
};

export function createContainImageVNode(h, value) {
  const id = typeof value === "string" ? value : value?.id;
  if (!id) {
    return h("span", { style: emptyStyle }, "Изображение не выбрано");
  }

  const params = new URLSearchParams({
    width: "720",
    height: "480",
    fit: "contain",
    withoutEnlargement: "true",
    quality: "85",
    format: "auto",
  });
  if (value?.modified_on) params.set("v", String(value.modified_on));

  const title = value?.title || value?.filename_download || "Изображение товара";
  const filename = value?.filename_download || title;

  return h(
    "figure",
    {
      style: {
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: "12px",
        width: "320px",
        maxWidth: "100%",
        margin: "0",
      },
    },
    [
      h("img", {
        src: `/assets/${encodeURIComponent(id)}?${params.toString()}`,
        alt: title,
        loading: "lazy",
        style: {
          display: "block",
          flex: "0 0 56px",
          width: "56px",
          height: "32px",
          objectFit: "contain",
          background: "var(--theme--background-subdued, #f4f6f5)",
          borderRadius: "var(--theme--border-radius, 6px)",
        },
      }),
      h(
        "figcaption",
        {
          style: {
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
}

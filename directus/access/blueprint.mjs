const permission = (collection, action, options = {}) => ({
  collection,
  action,
  permissions: options.permissions ?? null,
  validation: options.validation ?? null,
  presets: options.presets ?? null,
  fields: options.fields ?? ["*"],
  allowRestrictedFallback: options.allowRestrictedFallback ?? false,
});

const read = (collection, options) => permission(collection, "read", options);
const create = (collection, options) => permission(collection, "create", options);
const update = (collection, options) => permission(collection, "update", options);
const remove = (collection, options) => permission(collection, "delete", options);

const websiteCollections = [
  "site_settings",
  "home_page",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "articles",
  // Junction of the article flexible editor: the frontend resolves relation
  // nodes (products/categories) through it when rendering content_blocks.
  "articles_editor_nodes",
  "products",
  "faq_items",
  "lead_forms",
  "contact_channels",
  "recent_supplies",
  "product_images",
  "product_specifications",
  "product_documents",
  "seo_redirects",
  "orders",
  "order_items",
];

const contentCollections = websiteCollections.filter(
  (collection) => !["site_settings", "home_page"].includes(collection),
);

const publicAssetFolderId = "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a";
const leadAttachmentFolderId = "20fe4272-2f18-4ec8-a52a-f0efce9bcef8";
const folderFilter = (folderId) => ({ folder: { _eq: folderId } });

const frontendPermissions = [
  ...websiteCollections.map(read),
  read("directus_files", {
    permissions: folderFilter(publicAssetFolderId),
    allowRestrictedFallback: true,
  }),
  read("directus_folders"),
  create("directus_files", {
    validation: folderFilter(leadAttachmentFolderId),
    presets: { folder: leadAttachmentFolderId },
    allowRestrictedFallback: true,
  }),
  // Needed so the API route can move a freshly uploaded attachment into the
  // Lead attachments folder — Directus 12 Core ignores the multipart `folder`
  // field without a permission preset, and the preset is stripped by the
  // RESOURCE_RESTRICTED fallback, so the move is done via PATCH instead.
  // The route only ever patches the `folder` field on ids it just uploaded.
  update("directus_files"),
  remove("directus_files", {
    permissions: folderFilter(leadAttachmentFolderId),
    allowRestrictedFallback: true,
  }),
  create("leads"),
  create("orders"),
  create("order_items"),
];

const contentPermissions = [
  read("site_settings"),
  update("site_settings"),
  read("home_page"),
  update("home_page"),
  ...contentCollections.flatMap((collection) => [
    read(collection),
    create(collection),
    update(collection),
  ]),
  read("directus_files"),
  // Hero and editorial images uploaded from Directus Data Studio must be
  // publicly readable by the server-side media route. Directus applies this
  // preset during multipart uploads, so authors do not have to select a
  // storage folder manually.
  create("directus_files", {
    presets: { folder: publicAssetFolderId },
    allowRestrictedFallback: true,
  }),
  update("directus_files"),
  read("directus_folders"),
  create("directus_folders"),
];

const seoCollections = [
  "home_page",
  "pages",
  "page_sections",
  "categories",
  "articles",
  "products",
  "faq_items",
  "product_images",
  "seo_redirects",
];

const seoPermissions = [
  ...websiteCollections.map(read),
  read("directus_files"),
  ...seoCollections.flatMap((collection) => [
    create(collection),
    update(collection),
  ]),
];

export const accessBlueprint = {
  publicAssetFolder: {
    id: publicAssetFolderId,
    name: "Public",
  },
  leadAttachmentFolder: {
    id: leadAttachmentFolderId,
    name: "Lead attachments",
  },
  policies: [
    {
      key: "public",
      existingPolicyName: "$t:public_label",
      appAccess: false,
      adminAccess: false,
      permissions: [],
    },
    {
      key: "frontend_api",
      role: {
        name: "API фронтенда",
        existingNames: ["Frontend API"],
        icon: "dns",
        description:
          "Серверный доступ Next.js. Не используется в браузере.",
      },
      policyName: "API фронтенда",
      existingPolicyNames: ["Frontend API"],
      appAccess: false,
      adminAccess: false,
      permissions: frontendPermissions,
    },
    {
      key: "content_manager",
      role: {
        name: "Контент-менеджер",
        existingNames: ["Content Manager"],
        icon: "edit_note",
        description:
          "Управляет сайтом, каталогом и контентом без права удаления защищённых данных.",
      },
      policyName: "Контент-менеджер",
      existingPolicyNames: ["Content Manager"],
      appAccess: true,
      adminAccess: false,
      permissions: contentPermissions,
    },
    {
      key: "sales_manager",
      role: {
        name: "Менеджер продаж",
        existingNames: ["Sales Manager"],
        icon: "support_agent",
        description:
          "Работает с заявками и заказами без права удаления.",
      },
      policyName: "Менеджер продаж",
      existingPolicyNames: ["Sales Manager"],
      appAccess: true,
      adminAccess: false,
      permissions: [
        read("leads"),
        update("leads"),
        read("orders"),
        update("orders"),
        read("order_items"),
        read("directus_files", {
          permissions: folderFilter(leadAttachmentFolderId),
          allowRestrictedFallback: true,
        }),
      ],
    },
    {
      key: "seo_manager",
      role: {
        name: "SEO-менеджер",
        existingNames: ["SEO Manager"],
        icon: "manage_search",
        description:
          "Управляет SEO-полями страниц, категорий, товаров и статей.",
      },
      policyName: "SEO-менеджер",
      existingPolicyNames: ["SEO Manager"],
      appAccess: true,
      adminAccess: false,
      permissions: seoPermissions,
    },
    {
      key: "seo_worker",
      role: {
        name: "SEO Worker",
        existingNames: ["SEO Worker"],
        icon: "smart_toy",
        description:
          "Shadow-only service account: reads published SEO inputs, queues recommendations, and creates draft articles after manual approval.",
      },
      policyName: "SEO Worker",
      existingPolicyNames: ["SEO Worker"],
      appAccess: false,
      adminAccess: false,
      permissions: [
        read("products", { permissions: { status: { _eq: "published" } } }),
        read("categories", { permissions: { status: { _eq: "published" } } }),
        read("pages", { permissions: { status: { _eq: "published" } } }),
        read("seo_work_items"),
        create("seo_work_items"),
        update("seo_work_items"),
        create("articles", {
          fields: ["status", "title", "slug", "excerpt", "content", "published_at"],
          validation: { status: { _eq: "draft" } },
        }),
        update("articles", {
          fields: ["status", "title", "slug", "excerpt", "content", "published_at"],
          permissions: { status: { _eq: "draft" } },
          validation: { status: { _eq: "draft" } },
        }),
      ],
    },
  ],
};

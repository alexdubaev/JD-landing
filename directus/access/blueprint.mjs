const permission = (collection, action) => ({
  collection,
  action,
  permissions: null,
  validation: null,
  fields: ["*"],
});

const read = (collection) => permission(collection, "read");
const create = (collection) => permission(collection, "create");
const update = (collection) => permission(collection, "update");

const websiteCollections = [
  "site_settings",
  "pages",
  "page_sections",
  "navigation_items",
  "categories",
  "products",
  "faq_items",
  "lead_forms",
  "testimonials",
  "banners",
  "seo_redirects",
];

const contentCollections = websiteCollections.filter(
  (collection) => collection !== "site_settings",
);

const frontendPermissions = [
  ...websiteCollections.map(read),
  read("directus_files"),
  read("directus_folders"),
  create("leads"),
];

const contentPermissions = [
  read("site_settings"),
  update("site_settings"),
  ...contentCollections.flatMap((collection) => [
    read(collection),
    create(collection),
    update(collection),
  ]),
  read("directus_files"),
  create("directus_files"),
  update("directus_files"),
  read("directus_folders"),
  create("directus_folders"),
];

const seoCollections = [
  "pages",
  "categories",
  "products",
  "faq_items",
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

const publicAssetFolderId = "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a";

export const accessBlueprint = {
  publicAssetFolder: {
    id: publicAssetFolderId,
    name: "Public",
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
        name: "Frontend API",
        icon: "dns",
        description:
          "Server-only Next.js access. Publication filters and lead validation are enforced by the frontend.",
      },
      policyName: "Frontend API",
      appAccess: false,
      adminAccess: false,
      permissions: frontendPermissions,
    },
    {
      key: "content_manager",
      role: {
        name: "Content Manager",
        icon: "edit_note",
        description:
          "Manages site content and catalog without delete access. Directus 12 Core grants all fields for each allowed action.",
      },
      policyName: "Content Manager",
      appAccess: true,
      adminAccess: false,
      permissions: contentPermissions,
    },
    {
      key: "sales_manager",
      role: {
        name: "Sales Manager",
        icon: "support_agent",
        description:
          "Reads and updates leads without delete access. Directus 12 Core cannot restrict updates to individual fields.",
      },
      policyName: "Sales Manager",
      appAccess: true,
      adminAccess: false,
      permissions: [read("leads"), update("leads")],
    },
    {
      key: "seo_manager",
      role: {
        name: "SEO Manager",
        icon: "manage_search",
        description:
          "Manages SEO-bearing collections. Directus 12 Core cannot restrict updates to SEO fields only.",
      },
      policyName: "SEO Manager",
      appAccess: true,
      adminAccess: false,
      permissions: seoPermissions,
    },
  ],
};

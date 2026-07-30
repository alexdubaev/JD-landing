import sanitizeHtml from "sanitize-html";

const allowedTags = [
  "h2",
  "h3",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "blockquote",
  "a",
];

export function sanitizeArticleHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags,
    allowedAttributes: { a: ["href", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    disallowedTagsMode: "discard",
    exclusiveFilter(frame) {
      return frame.tag === "a" && !frame.attribs.href;
    },
    transformTags: {
      a: (_tagName, attribs) => ({
        tagName: "a",
        attribs: {
          href: attribs.href,
          rel: "nofollow noopener noreferrer",
        },
      }),
    },
  }).trim();
}

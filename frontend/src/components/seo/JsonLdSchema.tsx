export function JsonLdSchema({ data }: { data: Record<string, unknown> }) {
  const json = JSON.stringify(data).replaceAll("<", "\\u003c");
  return (
    <script
      dangerouslySetInnerHTML={{ __html: json }}
      type="application/ld+json"
    />
  );
}

import { getCatalogSuggestions } from "@/lib/directus/catalog";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 120) return Response.json({ items: [] });
  try {
    return Response.json({ items: await getCatalogSuggestions(query, 6) });
  } catch {
    return Response.json({ items: [] }, { status: 503 });
  }
}

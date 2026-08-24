import { fetchProductSuggestions } from "@/lib/directus/catalog";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 64) return Response.json({ items: [] });
  try {
    return Response.json({ items: await fetchProductSuggestions(query, 6) });
  } catch {
    return Response.json({ items: [] }, { status: 503 });
  }
}

import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/security/rate-limit";

const knownTopLevelPaths = new Set([
  "about", "api", "articles", "cart", "catalog", "contacts", "delivery",
  "0f81321649a7e9ba734d09aeb5a47c5a.txt", "favicon.ico", "icon-16.png", "icon-32.png",
  "apple-icon.png", "brand", "images",
  "llms.txt", "media", "parts-request", "privacy-policy", "robots.txt",
  "sitemap.xml", "thank-you", "_next", "_seo-not-found",
]);

const notFoundDocument = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Страница не найдена — DEERE-SHOP</title></head><body><main><p>Ошибка 404</p><h1>Страница не найдена</h1><p>Проверьте адрес или перейдите в каталог.</p><a href="/catalog">Перейти в каталог</a></main></body></html>`;

/** Reject unknown routes before the async root layout starts streaming. */
export function proxy(request: NextRequest) {
  const policy =
    request.nextUrl.pathname === "/api/leads" && request.method === "POST"
      ? { limit: 5, windowMs: 60 * 60 * 1000 }
      : request.nextUrl.pathname === "/api/orders" && request.method === "POST"
        ? { limit: 10, windowMs: 60 * 60 * 1000 }
        : request.nextUrl.pathname === "/api/revalidate" && request.method === "POST"
          ? { limit: 30, windowMs: 60 * 1000 }
          : null;
  if (policy) {
    const ip = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() || "unknown";
    const limit = checkRateLimit(`${request.nextUrl.pathname}:${ip}`, policy);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } },
      );
    }
  }
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();

  const { pathname } = request.nextUrl;
  const topLevelPath = pathname.split("/")[1];

  if (!topLevelPath || knownTopLevelPaths.has(topLevelPath)) return NextResponse.next();

  return new NextResponse(notFoundDocument, {
    status: 404,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "X-Robots-Tag": "noindex, follow",
    },
  });
}

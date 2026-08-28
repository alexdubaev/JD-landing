import { NextResponse, type NextRequest } from "next/server";

import { checkRateLimit } from "@/lib/security/rate-limit";
import { getTrustedClientIp } from "@/lib/security/request";

const knownTopLevelPaths = new Set([
  "about", "api", "articles", "cart", "catalog", "contacts", "delivery",
  "0f81321649a7e9ba734d09aeb5a47c5a.txt", "favicon.ico", "icon-16.png", "icon-32.png",
  "apple-icon.png", "brand", "images",
  "llms.txt", "media", "parts-request", "privacy-policy", "robots.txt",
  "sitemap.xml", "thank-you", "_next",
]);

const notFoundDocument = `<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="robots" content="noindex, follow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Страница не найдена — DEERE-SHOP</title></head><body><main><p>Ошибка 404</p><h1>Страница не найдена</h1><p>Проверьте адрес или перейдите в каталог.</p><a href="/catalog">Перейти в каталог</a></main></body></html>`;

type RateLimitPolicy = { limit: number; windowMs: number };

/**
 * Rate limits for unauthenticated routes that fan out into Directus work.
 * Pages and other assets are not limited. `/media/` gets a generous budget:
 * one catalog page loads dozens of images, so the limit only exists to cut
 * scripted id-enumeration, not normal browsing.
 */
export function resolveRateLimitPolicy(
  pathname: string,
  method: string,
): RateLimitPolicy | null {
  if (pathname === "/api/leads" && method === "POST") {
    return { limit: 5, windowMs: 60 * 60 * 1000 };
  }
  if (pathname === "/api/orders" && method === "POST") {
    return { limit: 10, windowMs: 60 * 60 * 1000 };
  }
  if (pathname === "/api/revalidate" && method === "POST") {
    return { limit: 30, windowMs: 60 * 1000 };
  }
  if (pathname === "/api/catalog/suggestions" && method === "GET") {
    return { limit: 60, windowMs: 60 * 1000 };
  }
  if (pathname.startsWith("/media/") && method === "GET") {
    return { limit: 600, windowMs: 60 * 1000 };
  }
  return null;
}

/** Reject unknown routes before the async root layout starts streaming. */
export function proxy(request: NextRequest) {
  const policy = resolveRateLimitPolicy(
    request.nextUrl.pathname,
    request.method,
  );

  if (policy) {
    const clientIp = getTrustedClientIp(request.headers) ?? "unknown";
    const limit = checkRateLimit(
      `${request.nextUrl.pathname}:${clientIp}`,
      policy,
    );
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

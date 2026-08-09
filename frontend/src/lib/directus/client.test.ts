import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { directusRequest, DirectusRequestError } from "./client";

describe("directusRequest", () => {
  beforeEach(() => {
    vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
    vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv(
      "DIRECTUS_PUBLIC_FOLDER_ID",
      "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
    );
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("authenticates a server-side request and unwraps the data envelope", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ data: [{ id: "product-id" }] })),
      );

    const result = await directusRequest<Array<{ id: string }>>(
      "/items/products?filter[status][_eq]=published",
    );

    expect(result).toEqual([{ id: "product-id" }]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://cms.example.test/items/products?filter[status][_eq]=published",
    );
    expect(new Headers(init?.headers).get("Authorization")).toBe(
      "Bearer server-token-for-tests-only",
    );
  });

  it("throws a safe typed error without exposing the token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("upstream details", { status: 503 }),
    );

    await expect(directusRequest("/items/products")).rejects.toEqual(
      expect.objectContaining<Partial<DirectusRequestError>>({
        name: "DirectusRequestError",
        status: 503,
      }),
    );

    try {
      await directusRequest("/items/products");
    } catch (error) {
      expect(String(error)).not.toContain("server-token-for-tests-only");
      expect(String(error)).not.toContain("upstream details");
    }
  });

  it("rejects absolute paths so a token cannot leak to another origin", async () => {
    await expect(
      directusRequest("https://attacker.example/items"),
    ).rejects.toThrow(/relative Directus API path/i);
  });
});

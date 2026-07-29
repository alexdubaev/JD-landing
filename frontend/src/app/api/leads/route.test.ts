import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

describe("POST /api/leads", () => {
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

  it("validates and stores a lead without exposing the Directus response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: { id: "lead-1" } }), {
        status: 200,
      }),
    );
    const response = await POST(
      new Request("https://example.test/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Иван",
          phone: "+7 900 000-00-00",
          email: "ivan@example.test",
          message: "Нужен подбор",
          page_url: "https://example.test/catalog",
          website: "",
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(String(fetchMock.mock.calls[0][0])).toContain("/items/leads");
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain(
      '"status":"new"',
    );
  });

  it("returns a safe validation response and does not call Directus", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("https://example.test/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "", phone: "1", website: "bot" }),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Проверьте заполнение формы",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

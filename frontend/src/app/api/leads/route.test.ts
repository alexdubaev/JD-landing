import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "./route";

const multipartRequest = (form: FormData, headers: HeadersInit = {}) => {
  const mergedHeaders = new Headers({ "content-length": "1024", "content-type": "multipart/form-data" });
  new Headers(headers).forEach((value, key) => mergedHeaders.set(key, value));
  return ({ headers: mergedHeaders, formData: async () => form }) as unknown as Request;
};

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

  it("uploads valid multipart attachments and stores normalized request items", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "file-sheet" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "file-photo" } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "lead-1" } }), {
          status: 200,
        }),
      );
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set(
      "request_items",
      JSON.stringify([{ article: "RE504836", quantity: 2 }]),
    );
    form.set(
      "spreadsheet",
      new File(["article,quantity\nRE504836,2"], "request.csv", {
        type: "text/csv",
      }),
    );
    form.set(
      "photo",
      new File(["image"], "marking.webp", { type: "image/webp" }),
    );

    const response = await POST(multipartRequest(form));
    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/files");
    const uploadBody = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(uploadBody.get("folder")).toBe("20fe4272-2f18-4ec8-a52a-f0efce9bcef8");
    expect(String(fetchMock.mock.calls[2][0])).toContain("/items/leads");
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain(
      '"request_items":[{"article":"RE504836","quantity":2}]',
    );
    expect(String(fetchMock.mock.calls[2][1]?.body)).toContain(
      '"attachments":["file-sheet","file-photo"]',
    );
  });

  it("rejects unsupported multipart files before uploading anything", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set(
      "request_items",
      JSON.stringify([{ article: "RE504836", quantity: 2 }]),
    );
    form.set(
      "spreadsheet",
      new File(["nope"], "request.pdf", { type: "application/pdf" }),
    );

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a file without a declared MIME type before uploading", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set("request_items", JSON.stringify([{ article: "RE504836", quantity: 2 }]));
    form.set("photo", new File(["image"], "marking.webp"));

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects oversized multipart photos before uploading anything", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set(
      "request_items",
      JSON.stringify([{ article: "RE504836", quantity: 2 }]),
    );
    form.set(
      "photo",
      new File([new Uint8Array(8 * 1024 * 1024 + 1)], "marking.webp", {
        type: "image/webp",
      }),
    );

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects multipart lists with more than 100 positions", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set(
      "request_items",
      JSON.stringify(
        Array.from({ length: 101 }, (_, index) => ({
          article: `RE${index}`,
          quantity: 1,
        })),
      ),
    );

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("requires items or an attachment for a multipart parts request", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects malformed request item JSON without uploading files", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set("request_items", "{");

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a request whose announced content length exceeds the aggregate limit", async () => {
    const formData = vi.fn(async () => new FormData());
    const response = await POST({
      headers: new Headers({
        "content-type": "multipart/form-data",
        "content-length": String(21 * 1024 * 1024),
      }),
      formData,
    } as unknown as Request);

    expect(response.status).toBe(413);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects multipart requests without a trustworthy content length", async () => {
    const form = new FormData();
    form.set("name", "Иван");
    const response = await POST(multipartRequest(form, { "content-length": "" }));

    expect(response.status).toBe(411);
  });

  it("cleans up the first file when the second attachment upload fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: "file-sheet" } }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("upload failed", { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set("request_items", JSON.stringify([{ article: "RE504836", quantity: 1 }]));
    form.set("spreadsheet", new File(["a"], "parts.csv", { type: "text/csv" }));
    form.set("photo", new File(["a"], "marking.webp", { type: "image/webp" }));

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(503);
    expect(String(fetchMock.mock.calls[2][0])).toContain("/files/file-sheet");
    expect(fetchMock.mock.calls[2][1]?.method).toBe("DELETE");
  });

  it("cleans up uploaded files when creating the lead fails", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "file-sheet" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: { id: "file-photo" } }), { status: 200 }))
      .mockResolvedValueOnce(new Response("lead failed", { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const form = new FormData();
    form.set("name", "Иван");
    form.set("phone", "+7 900 000-00-00");
    form.set("page_url", "https://example.test/");
    form.set("website", "");
    form.set("request_items", JSON.stringify([{ article: "RE504836", quantity: 1 }]));
    form.set("spreadsheet", new File(["a"], "parts.csv", { type: "text/csv" }));
    form.set("photo", new File(["a"], "marking.webp", { type: "image/webp" }));

    const response = await POST(multipartRequest(form));

    expect(response.status).toBe(503);
    expect(String(fetchMock.mock.calls[3][0])).toContain("/files/file-sheet");
    expect(String(fetchMock.mock.calls[4][0])).toContain("/files/file-photo");
  });

  it("returns a validation response for malformed JSON", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("https://example.test/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      }),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

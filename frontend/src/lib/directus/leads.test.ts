import { beforeEach, describe, expect, it, vi } from "vitest";

import { directusRequest } from "./client";
import { createLead, uploadLeadAttachment } from "./leads";

vi.mock("./client", () => ({ directusRequest: vi.fn() }));

const requestMock = vi.mocked(directusRequest);

const leadInput = () => ({
  name: "Иван",
  phone: "+7 900 000-00-00",
  email: undefined,
  message: undefined,
  product: undefined,
  category: undefined,
  page_url: "https://example.test/parts-request",
  utm_source: "yandex",
  utm_medium: undefined,
  utm_campaign: undefined,
  utm_content: undefined,
  utm_term: undefined,
  marketing_consent: false,
  turnstile_token: "token",
  website: "",
  request_items: undefined,
});

describe("uploadLeadAttachment", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMock.mockResolvedValue({ id: "file-1" });
  });

  it("sanitizes a hostile file name down to a safe base name", async () => {
    const file = new File(["data"], "../../../etc/passwd", {
      type: "text/csv",
    });

    await uploadLeadAttachment(file);

    const [path, init] = requestMock.mock.calls[0];
    expect(path).toBe("/files");
    const form = init?.body as FormData;
    const uploaded = form.get("file") as File;
    // Slashes collapse into dashes, so no path segments survive; dots do.
    expect(uploaded.name).toBe("..-..-..-etc-passwd");
    expect(form.get("folder")).toBe("20fe4272-2f18-4ec8-a52a-f0efce9bcef8");
    expect(form.get("title")).toBe("Заявка: ..-..-..-etc-passwd");
  });

  it("caps very long names and falls back to a generic one when blank", async () => {
    const longName = `${"a".repeat(150)}.csv`;
    await uploadLeadAttachment(new File(["x"], longName));
    const first = requestMock.mock.calls[0][1]?.body as FormData;
    expect((first.get("file") as File).name).toHaveLength(100);

    requestMock.mockClear();
    // Control characters are stripped and whitespace trimmed — nothing left.
    await uploadLeadAttachment(new File(["x"], "\u0001\u001f \u0007"));
    const second = requestMock.mock.calls[0][1]?.body as FormData;
    expect((second.get("file") as File).name).toBe("attachment");
  });

  it("does not fail the upload when the folder-move PATCH is rejected", async () => {
    requestMock
      .mockResolvedValueOnce({ id: "file-1" })
      .mockRejectedValueOnce(new Error("403"));

    await expect(uploadLeadAttachment(new File(["x"], "list.csv"))).resolves.toBe(
      "file-1",
    );
    const [patchPath, patchInit] = requestMock.mock.calls[1];
    expect(patchPath).toBe("/files/file-1");
    expect(patchInit?.method).toBe("PATCH");
    expect(JSON.parse(patchInit?.body as string)).toEqual({
      folder: "20fe4272-2f18-4ec8-a52a-f0efce9bcef8",
    });
  });
});

describe("createLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMock.mockResolvedValue({ id: "lead-1" });
  });

  it("maps the validated input onto the lead payload", async () => {
    await createLead(leadInput(), {
      attachments: ["file-1"],
      requestItems: [{ article: "RE504836", quantity: 2 }],
    });

    const [path, init] = requestMock.mock.calls[0];
    expect(path).toBe("/items/leads");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(init?.body as string)).toEqual({
      name: "Иван",
      phone: "+7 900 000-00-00",
      email: null,
      message: null,
      product: null,
      category: null,
      page_url: "https://example.test/parts-request",
      utm_source: "yandex",
      utm_medium: null,
      utm_campaign: null,
      utm_content: null,
      utm_term: null,
      marketing_consent: false,
      marketing_consent_at: null,
      marketing_consent_version: null,
      request_items: [{ article: "RE504836", quantity: 2 }],
      attachments: ["file-1"],
      status: "new",
    });
  });
});

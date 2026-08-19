import { beforeEach, describe, expect, it, vi } from "vitest";

import { PREVIEW_COOKIE_NAME } from "@/lib/directus/client";

const headersMock = vi.hoisted(() => {
  const draft = { isEnabled: true, enable: vi.fn(), disable: vi.fn() };
  const store = { set: vi.fn(), get: vi.fn(), delete: vi.fn() };
  return {
    draft,
    store,
    draftMode: vi.fn(async () => draft),
    cookies: vi.fn(async () => store),
  };
});
vi.mock("next/headers", () => ({
  draftMode: headersMock.draftMode,
  cookies: headersMock.cookies,
}));

import { GET } from "./route";

describe("GET /api/preview/disable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exits draft mode, clears the preview cookie and redirects home", async () => {
    const response = await GET();

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/");
    expect(headersMock.draft.disable).toHaveBeenCalledTimes(1);
    expect(headersMock.store.delete).toHaveBeenCalledWith(PREVIEW_COOKIE_NAME);
  });
});

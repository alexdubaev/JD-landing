import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isIndexNowConfigured, notifyIndexNow } from "./indexnow";

const ORIGINAL_ENV = { ...process.env };

describe("isIndexNowConfigured", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.INDEXNOW_KEY;
    delete process.env.NEXT_PUBLIC_SITE_URL;
  });

  it("returns false when the key is missing", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://deere-shop.ru";
    expect(isIndexNowConfigured()).toBe(false);
  });

  it("returns false when the site URL is missing", () => {
    process.env.INDEXNOW_KEY = "abc123";
    expect(isIndexNowConfigured()).toBe(false);
  });

  it("returns true when both key and site URL are set", () => {
    process.env.INDEXNOW_KEY = "abc123";
    process.env.NEXT_PUBLIC_SITE_URL = "https://deere-shop.ru";
    expect(isIndexNowConfigured()).toBe(true);
  });
});

describe("notifyIndexNow", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
    process.env.INDEXNOW_KEY = "test-key-123";
    process.env.NEXT_PUBLIC_SITE_URL = "https://deere-shop.ru";
    fetchMock.mockClear();
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env = { ...ORIGINAL_ENV };
  });

  it("does nothing when not configured (no fetch call)", async () => {
    delete process.env.INDEXNOW_KEY;
    await notifyIndexNow(["/catalog"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing for an empty path list", async () => {
    await notifyIndexNow([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts the correct IndexNow payload with host, key and keyLocation", async () => {
    await notifyIndexNow(["/catalog", "/catalog/tractors"]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [endpoint, init] = fetchMock.mock.calls[0];
    expect(endpoint).toBe("https://api.indexnow.org/IndexNow");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string);
    expect(body.host).toBe("deere-shop.ru");
    expect(body.key).toBe("test-key-123");
    expect(body.keyLocation).toBe("https://deere-shop.ru/test-key-123.txt");
    expect(body.urlList).toEqual([
      "https://deere-shop.ru/catalog",
      "https://deere-shop.ru/catalog/tractors",
    ]);
  });

  it("deduplicates paths", async () => {
    await notifyIndexNow(["/catalog", "/catalog", "/"]);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.urlList).toEqual([
      "https://deere-shop.ru/catalog",
      "https://deere-shop.ru/",
    ]);
  });

  it("swallows HTTP errors without throwing (webhook must stay reliable)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    const onError = vi.fn();
    await expect(notifyIndexNow(["/catalog"], { onError })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("400"));
  });

  it("swallows network errors without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(
      notifyIndexNow(["/catalog"]),
    ).resolves.toBeUndefined();
  });
});

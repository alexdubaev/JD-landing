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
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  it("does nothing when not configured (no fetch call)", async () => {
    delete process.env.INDEXNOW_KEY;
    await notifyIndexNow(["/catalog"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("warns and skips instead of throwing when the site URL is malformed", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "not-a-valid-url";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(notifyIndexNow(["/catalog"])).resolves.toBeUndefined();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("NEXT_PUBLIC_SITE_URL"),
    );
    warnSpy.mockRestore();
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

  it.each([200, 202])("records HTTP %i without exposing the payload or key", async (status) => {
    fetchMock.mockResolvedValue(new Response(null, { status }));
    await notifyIndexNow(["/catalog/item"]);
    expect(console.info).toHaveBeenCalledWith("[indexnow] submission", {
      status, count: 1,
      outcome: status === 200 ? "submitted" : "key_verification_pending",
    });
    expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain("test-key-123");
  });

  it("sends only normalized public paths and bounds the request", async () => {
    await notifyIndexNow(["/catalog", "//evil.test/path", "/catalog?token=private", "/catalog#private", "/a/../private", "/a\\private", "//[invalid", "https://evil.test"]);
    const init = fetchMock.mock.calls[0][1];
    expect(JSON.parse(init.body).urlList).toEqual(["https://deere-shop.ru/catalog"]);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("aborts a stalled request and reports a redacted timeout", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, "timeout").mockImplementation((delay) => {
      setTimeout(() => controller.abort(new DOMException("sensitive transport detail", "TimeoutError")), delay);
      return controller.signal;
    });
    fetchMock.mockImplementation((_url, init) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(init.signal.reason));
    }));
    const onError = vi.fn();
    try {
      const pending = notifyIndexNow(["/catalog"], { onError });
      await vi.advanceTimersByTimeAsync(5000);
      await pending;
      expect(controller.signal.aborted).toBe(true);
      expect(onError).toHaveBeenCalledWith("IndexNow ping timed out");
    } finally {
      vi.useRealTimers();
    }
  });

  it("swallows HTTP errors without throwing (webhook must stay reliable)", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 400 }));
    const onError = vi.fn();
    await expect(notifyIndexNow(["/catalog"], { onError })).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(expect.stringContaining("400"));
  });

  it("swallows network errors without throwing", async () => {
    fetchMock.mockRejectedValue(new Error("network down test-key-123 Authorization: private"));
    const onError = vi.fn();
    await expect(
      notifyIndexNow(["/catalog"], { onError }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith("IndexNow ping network error");
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/test-key-123|Authorization|private/u);
  });
});

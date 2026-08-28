import { afterEach, describe, expect, it, vi } from "vitest";

import { getServerEnv } from "./env";

afterEach(() => {
  vi.unstubAllEnvs();
});

const stubCompleteEnv = () => {
  vi.stubEnv("DIRECTUS_URL", "https://cms.example.test/");
  vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
  vi.stubEnv(
    "DIRECTUS_PUBLIC_FOLDER_ID",
    "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a",
  );
  vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test///");
};

describe("getServerEnv", () => {
  it("parses a complete configuration and trims trailing slashes", () => {
    stubCompleteEnv();

    const env = getServerEnv();

    expect(env.DIRECTUS_URL).toBe("https://cms.example.test");
    expect(env.NEXT_PUBLIC_SITE_URL).toBe("https://example.test");
  });

  it("rejects an empty Directus token", () => {
    stubCompleteEnv();
    vi.stubEnv("DIRECTUS_TOKEN", "");

    expect(() => getServerEnv()).toThrow();
  });

  it("rejects a non-URL Directus origin", () => {
    stubCompleteEnv();
    vi.stubEnv("DIRECTUS_URL", "not-a-url");

    expect(() => getServerEnv()).toThrow();
  });

  it("rejects a malformed public folder id", () => {
    stubCompleteEnv();
    vi.stubEnv("DIRECTUS_PUBLIC_FOLDER_ID", "not-a-uuid");

    expect(() => getServerEnv()).toThrow();
  });
});

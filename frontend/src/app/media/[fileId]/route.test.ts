import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

const publicFolderId = "1ecf70c5-0ad4-4e5e-8d73-78ee549f064a";
const fileId = "9af727df-c55a-48d9-bbd0-458a18237068";

describe("GET /media/[fileId]", () => {
  beforeEach(() => {
    vi.stubEnv("DIRECTUS_URL", "https://cms.example.test");
    vi.stubEnv("DIRECTUS_TOKEN", "server-token-for-tests-only");
    vi.stubEnv("DIRECTUS_PUBLIC_FOLDER_ID", publicFolderId);
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("proxies only files from the designated public folder", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: {
              id: fileId,
              folder: { id: publicFolderId },
              type: "image/png",
              filename_download: "part.png",
            },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { "Content-Type": "application/octet-stream" },
        }),
      );

    const response = await GET(
      new Request(
        `https://example.test/media/${fileId}?width=900&quality=80&format=webp&unsafe=x`,
      ),
      { params: Promise.resolve({ fileId }) },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(String(fetchMock.mock.calls[1][0])).toContain(
      `/assets/${fileId}?width=900&quality=80&format=webp`,
    );
    expect(String(fetchMock.mock.calls[1][0])).not.toContain("unsafe");
    expect(
      new Headers(fetchMock.mock.calls[1][1]?.headers).get("Authorization"),
    ).toBe("Bearer server-token-for-tests-only");
  });

  it("returns not found for a file outside the public folder", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: fileId,
            folder: "3df31a55-a903-42e7-b93e-c845763ca21f",
            type: "image/png",
            filename_download: "private.png",
          },
        }),
      ),
    );

    const response = await GET(
      new Request(`https://example.test/media/${fileId}`),
      { params: Promise.resolve({ fileId }) },
    );

    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

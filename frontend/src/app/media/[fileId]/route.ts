import { directusRequest } from "@/lib/directus/client";
import { getServerEnv } from "@/lib/directus/env";

type RawFile = {
  id: string;
  folder: string | { id: string } | null;
  type: string | null;
  filename_download: string;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const fitValues = new Set(["contain", "cover", "inside", "outside"]);
const formatValues = new Set(["auto", "jpg", "png", "webp", "avif"]);
const formatContentTypes: Record<string, string> = {
  avif: "image/avif",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
const extensionContentTypes: Record<string, string> = {
  avif: "image/avif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  svg: "image/svg+xml",
  webp: "image/webp",
};

const fileFolderId = (folder: RawFile["folder"]) =>
  typeof folder === "string" ? folder : (folder?.id ?? null);

const safeTransforms = (url: URL) => {
  const output = new URLSearchParams();
  for (const name of ["width", "height", "quality"] as const) {
    const rawValue = url.searchParams.get(name);
    if (!rawValue) continue;
    const value = Number.parseInt(rawValue, 10);
    const minimum = name === "quality" ? 20 : 32;
    const maximum = name === "quality" ? 95 : 2400;
    if (Number.isFinite(value) && value >= minimum && value <= maximum) {
      output.set(name, String(value));
    }
  }
  const fit = url.searchParams.get("fit");
  if (fit && fitValues.has(fit)) output.set("fit", fit);
  const format = url.searchParams.get("format");
  if (format && formatValues.has(format)) output.set("format", format);
  return output;
};

const responseContentType = (
  upstreamType: string | null,
  file: RawFile,
  transforms: URLSearchParams,
) => {
  if (upstreamType && upstreamType !== "application/octet-stream") {
    return upstreamType;
  }
  const transformedFormat = transforms.get("format");
  if (transformedFormat && formatContentTypes[transformedFormat]) {
    return formatContentTypes[transformedFormat];
  }
  if (file.type && file.type !== "application/octet-stream") return file.type;
  const extension = file.filename_download.split(".").at(-1)?.toLowerCase();
  return (extension && extensionContentTypes[extension]) || "application/octet-stream";
};

export async function GET(
  request: Request,
  context: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await context.params;
  if (!uuidPattern.test(fileId)) {
    return new Response("Not found", { status: 404 });
  }

  const environment = getServerEnv();
  let file: RawFile;
  try {
    file = await directusRequest<RawFile>(
      `/files/${encodeURIComponent(fileId)}?fields=id,folder.id,type,filename_download`,
      { next: { revalidate: 300, tags: [`file:${fileId}`] } },
    );
  } catch {
    return new Response("Not found", { status: 404 });
  }
  if (fileFolderId(file.folder) !== environment.DIRECTUS_PUBLIC_FOLDER_ID) {
    return new Response("Not found", { status: 404 });
  }

  const transforms = safeTransforms(new URL(request.url));
  const assetUrl = `${environment.DIRECTUS_URL}/assets/${encodeURIComponent(fileId)}${transforms.size ? `?${transforms.toString()}` : ""}`;
  const upstream = await fetch(assetUrl, {
    headers: {
      Accept: file.type ?? "*/*",
      Authorization: `Bearer ${environment.DIRECTUS_TOKEN}`,
    },
    next: { revalidate: 300, tags: [`asset:${fileId}`] },
  });
  if (!upstream.ok || !upstream.body) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  headers.set(
    "Content-Type",
    responseContentType(upstream.headers.get("Content-Type"), file, transforms),
  );
  headers.set("Cache-Control", "public, max-age=300, stale-while-revalidate=86400");
  const etag = upstream.headers.get("ETag");
  if (etag) headers.set("ETag", etag);

  return new Response(upstream.body, { headers });
}

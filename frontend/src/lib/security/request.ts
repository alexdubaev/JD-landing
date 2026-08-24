import { isIP } from "node:net";

export class RequestTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured byte limit");
    this.name = "RequestTooLargeError";
  }
}

/**
 * Caddy is the only trusted proxy in production. A single valid forwarded
 * address is accepted; a chain or malformed value is ambiguous and rejected.
 */
export function getTrustedClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.trim();
  if (!forwarded || forwarded.includes(",") || isIP(forwarded) === 0) {
    return null;
  }
  return forwarded;
}

export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  const declaredLength = contentLength === null ? NaN : Number(contentLength);
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new RequestTooLargeError();
  }

  if (!request.body) return new Uint8Array();

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) throw new RequestTooLargeError();
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

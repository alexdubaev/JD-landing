import { isIP } from "node:net";

export class RequestTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured byte limit");
  }
}

/**
 * Caddy is the only trusted proxy in the production topology. A single valid
 * forwarded address is accepted; a chain is ambiguous and therefore rejected.
 */
export function getTrustedClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.trim();
  return forwarded && !forwarded.includes(",") && isIP(forwarded) !== 0
    ? forwarded
    : null;
}

export async function readBodyWithinLimit(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const declaredLength = Number(request.headers.get("content-length"));
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
      total += value.byteLength;
      if (total > maxBytes) throw new RequestTooLargeError();
      chunks.push(value);
    }
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

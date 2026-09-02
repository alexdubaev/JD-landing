function isIpv4(value: string): boolean {
  const parts = value.split(".");
  return parts.length === 4 && parts.every((part) => /^(?:0|[1-9]\d{0,2})$/u.test(part) && Number(part) <= 255);
}

function isIpv6(value: string): boolean {
  const sections = value.split("::");
  if (sections.length > 2 || !value.includes(":")) return false;

  const groups = sections.flatMap((section) => section ? section.split(":") : []);
  let units = 0;
  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    if (group.includes(".")) {
      if (index !== groups.length - 1 || !isIpv4(group)) return false;
      units += 2;
    } else {
      if (!/^[\da-f]{1,4}$/iu.test(group)) return false;
      units += 1;
    }
  }

  return sections.length === 2 ? units < 8 : units === 8;
}

function isIp(value: string): boolean {
  return isIpv4(value) || isIpv6(value);
}

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
  if (!forwarded || forwarded.includes(",") || !isIp(forwarded)) {
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

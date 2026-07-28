import "server-only";

import type { DirectusEnvelope } from "@/types/directus";

import { getServerEnv } from "./env";

type NextFetchOptions = {
  revalidate?: number | false;
  tags?: string[];
};

export type DirectusRequestInit = RequestInit & {
  next?: NextFetchOptions;
};

export class DirectusRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly path: string,
  ) {
    super(`Directus request failed with HTTP ${status}`);
    this.name = "DirectusRequestError";
  }
}

const assertRelativeApiPath = (path: string) => {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new TypeError("Expected a relative Directus API path");
  }
};

export async function directusRequest<T>(
  path: string,
  init: DirectusRequestInit = {},
): Promise<T> {
  assertRelativeApiPath(path);
  const environment = getServerEnv();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${environment.DIRECTUS_TOKEN}`);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${environment.DIRECTUS_URL}${path}`, {
    ...init,
    headers,
  });
  if (!response.ok) {
    throw new DirectusRequestError(response.status, path.split("?").at(0)!);
  }
  if (response.status === 204) return undefined as T;

  const envelope = (await response.json()) as DirectusEnvelope<T>;
  return envelope.data;
}

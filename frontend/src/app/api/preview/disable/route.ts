import { cookies, draftMode } from "next/headers";

import { PREVIEW_COOKIE_NAME } from "@/lib/directus/client";

/**
 * Exits Live Preview (Task 16): disables Next.js draft mode, clears the signed
 * preview cookie and redirects home. No secret is required — leaving preview
 * only ever reduces access.
 */
export async function GET() {
  const draft = await draftMode();
  draft.disable();
  const store = await cookies();
  store.delete(PREVIEW_COOKIE_NAME);
  return new Response(null, {
    status: 302,
    headers: { Location: "/" },
  });
}

import "server-only";

import { z } from "zod";

const serverEnvSchema = z.object({
  DIRECTUS_URL: z.url(),
  DIRECTUS_TOKEN: z.string().min(20),
  DIRECTUS_PUBLIC_FOLDER_ID: z.uuid(),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getServerEnv(
  environment: NodeJS.ProcessEnv = process.env,
): ServerEnv {
  const parsed = serverEnvSchema.parse(environment);
  return {
    ...parsed,
    DIRECTUS_URL: parsed.DIRECTUS_URL.replace(/\/+$/u, ""),
    NEXT_PUBLIC_SITE_URL: parsed.NEXT_PUBLIC_SITE_URL.replace(/\/+$/u, ""),
  };
}

import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// The review environment deliberately uses the adapter's in-memory cache.
// Production cache/binding changes remain outside this test-only adapter.
export default defineCloudflareConfig();

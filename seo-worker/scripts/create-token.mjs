import { chmod, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

async function request(fetchImpl, baseUrl, adminToken, path, init = {}) {
  const response = await fetchImpl(`${baseUrl.replace(/\/$/u, "")}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${adminToken}`, "content-type": "application/json", ...(init.headers ?? {}) },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Directus token provisioning failed (${response.status})`);
  return body.data ?? body;
}

export async function provisionWorkerToken({
  baseUrl,
  adminToken,
  roleId,
  email = "seo-worker@internal.invalid",
  tokenFile,
  fetchImpl = fetch,
  randomToken = () => randomBytes(32).toString("hex"),
}) {
  if (!baseUrl || !adminToken || !roleId || !tokenFile) throw new Error("baseUrl, adminToken, roleId and tokenFile are required");
  const existing = await request(fetchImpl, baseUrl, adminToken, `/users?filter[email][_eq]=${encodeURIComponent(email)}&limit=1`);
  const token = randomToken();
  const payload = { email, role: roleId, status: "active", token };
  const user = existing?.[0]?.id
    ? await request(fetchImpl, baseUrl, adminToken, `/users/${encodeURIComponent(existing[0].id)}`, { method: "PATCH", body: JSON.stringify({ role: roleId, status: "active", token }) })
    : await request(fetchImpl, baseUrl, adminToken, "/users", { method: "POST", body: JSON.stringify({ ...payload, password: randomBytes(24).toString("hex") }) });
  await writeFile(tokenFile, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(tokenFile, 0o600);
  return { id: user.id, tokenFile, email };
}

if (process.argv[1]?.endsWith("create-token.mjs")) {
  provisionWorkerToken({
    baseUrl: process.env.DIRECTUS_URL,
    adminToken: process.env.DIRECTUS_ADMIN_TOKEN,
    roleId: process.env.SEO_FACTORY_WORKER_ROLE_ID,
    tokenFile: process.env.SEO_WORKER_TOKEN_FILE || "/run/secrets/seo-worker-token",
  }).then(({ tokenFile }) => console.log(`SEO Worker token written to ${tokenFile}`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

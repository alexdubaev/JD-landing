type TurnstileOptions = {
  token: string | undefined;
  remoteIp: string | null;
  secret?: string | undefined;
  nodeEnv?: string | undefined;
};

export async function verifyTurnstile({
  token,
  remoteIp,
  secret = process.env.TURNSTILE_SECRET_KEY,
  nodeEnv = process.env.NODE_ENV,
}: TurnstileOptions): Promise<boolean> {
  if (!secret) return nodeEnv !== "production";
  if (!token) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      { method: "POST", body: form, cache: "no-store" },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

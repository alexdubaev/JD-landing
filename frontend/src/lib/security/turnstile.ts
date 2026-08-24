type TurnstileOptions = {
  token: string | undefined;
  remoteIp: string | null;
  secret?: string | undefined;
  timeoutMs?: number | undefined;
};

export async function verifyTurnstile({
  token,
  remoteIp,
  secret = process.env.TURNSTILE_SECRET_KEY,
  timeoutMs = 5_000,
}: TurnstileOptions): Promise<boolean> {
  // Turnstile is an optional control until the owner provisions and enables
  // the secret. A configured verifier still fails closed on every error.
  if (!secret) return true;
  if (!token) return false;

  const form = new FormData();
  form.set("secret", secret);
  form.set("response", token);
  if (remoteIp) form.set("remoteip", remoteIp);

  try {
    const response = await fetch(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify",
      {
        method: "POST",
        body: form,
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch {
    return false;
  }
}

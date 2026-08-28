"use client";

import { useCallback, useState } from "react";

export type FormSubmitState = "idle" | "sending" | "success" | "error";

/**
 * Shared submit contract for the three lead/order forms:
 * - a null response (network failure) shows the form's fallback message;
 * - a non-ok response surfaces the server's `error` field when present;
 * - ok runs the form's onSuccess callback (analytics, cleanup) and flips to
 *   the success screen.
 * Turnstile resets and payload assembly stay in the forms — this hook only
 * owns the state machine and the server-error contract.
 */
export function useFormSubmit() {
  const [state, setState] = useState<FormSubmitState>("idle");
  const [serverError, setServerError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setState("idle");
    setServerError(null);
  }, []);

  const submit = useCallback(
    async (
      send: () => Promise<Response | null>,
      onSuccess: (response: Response) => Promise<void> | void,
      fallbackError: string,
    ): Promise<boolean> => {
      setState("sending");
      setServerError(null);
      const response = await send().catch(() => null);
      if (response?.ok) {
        await onSuccess(response);
        setState("success");
        return true;
      }
      const body = response
        ? ((await response.json().catch(() => null)) as {
            error?: string;
          } | null)
        : null;
      setServerError(body?.error ?? fallbackError);
      setState("error");
      return false;
    },
    [],
  );

  return { state, serverError, submit, reset };
}

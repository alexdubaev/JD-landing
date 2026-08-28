import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useFormSubmit } from "./use-form-submit";

function Probe({
  send,
  onSuccess,
}: {
  send: () => Promise<Response | null>;
  onSuccess?: (response: Response) => void;
}) {
  const { state, serverError, submit } = useFormSubmit();
  return (
    <div>
      <output data-testid="state">{state}</output>
      <output data-testid="error">{serverError ?? ""}</output>
      <button
        onClick={() =>
          submit(send, onSuccess ?? (() => {}), "Сетевой сбой")
        }
        type="button"
      >
        send
      </button>
    </div>
  );
}

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("useFormSubmit", () => {
  it("runs the success flow through onSuccess", async () => {
    const onSuccess = vi.fn();
    render(<Probe send={() => Promise.resolve(jsonResponse(200, {}))} onSuccess={onSuccess} />);

    await act(async () => {
      screen.getByRole("button", { name: "send" }).click();
    });

    expect(screen.getByTestId("state").textContent).toBe("success");
    expect(screen.getByTestId("error").textContent).toBe("");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("surfaces the server error field on a 4xx response", async () => {
    render(
      <Probe
        send={() => Promise.resolve(jsonResponse(400, { error: "Телефон обязателен" }))}
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "send" }).click();
    });

    expect(screen.getByTestId("state").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toBe("Телефон обязателен");
  });

  it("falls back to the form's message when the body has no error field", async () => {
    render(<Probe send={() => Promise.resolve(jsonResponse(503, {}))} />);

    await act(async () => {
      screen.getByRole("button", { name: "send" }).click();
    });

    expect(screen.getByTestId("state").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toBe("Сетевой сбой");
  });

  it("treats a network failure (null response) as an error with the fallback message", async () => {
    render(<Probe send={() => Promise.resolve(null)} />);

    await act(async () => {
      screen.getByRole("button", { name: "send" }).click();
    });

    expect(screen.getByTestId("state").textContent).toBe("error");
    expect(screen.getByTestId("error").textContent).toBe("Сетевой сбой");
  });

  it("recovers: a later successful submit clears the previous error", async () => {
    let fail = true;
    const { rerender } = render(
      <Probe
        send={() =>
          fail
            ? Promise.resolve(jsonResponse(400, { error: "первый отказ" }))
            : Promise.resolve(jsonResponse(200, {}))
        }
      />,
    );

    await act(async () => {
      screen.getByRole("button", { name: "send" }).click();
    });
    expect(screen.getByTestId("error").textContent).toBe("первый отказ");

    fail = false;
    rerender(
      <Probe
        send={() =>
          fail
            ? Promise.resolve(jsonResponse(400, { error: "первый отказ" }))
            : Promise.resolve(jsonResponse(200, {}))
        }
      />,
    );
    await act(async () => {
      screen.getByRole("button", { name: "send" }).click();
    });

    expect(screen.getByTestId("state").textContent).toBe("success");
    expect(screen.getByTestId("error").textContent).toBe("");
  });
});

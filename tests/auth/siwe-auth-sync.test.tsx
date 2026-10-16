import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
import React from "react";
import { Providers } from "@/components/providers";
import { useSiweAuth } from "@/hooks/useSiweAuth";

// Must match the private AUTH_CHANGE_EVENT in hooks/useSiweAuth.ts.
const AUTH_CHANGE_EVENT = "chimphood:siwe-auth-change";

function Consumer({ id }: { id: string }) {
  const { status, sessionAddress } = useSiweAuth();
  return (
    <div>
      <span data-testid={`${id}-status`}>{status}</span>
      <span data-testid={`${id}-address`}>{sessionAddress ?? "none"}</span>
    </div>
  );
}

/**
 * The navbar and the profile card each mount their own `useSiweAuth()`
 * instance. When one of them logs in or out, every other mounted instance
 * must converge to the same server-side session state without a refresh.
 */
describe("useSiweAuth cross-instance sync", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("syncs all mounted instances when the auth-change event fires", async () => {
    let serverAuthenticated = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url).includes("/api/auth/session")) {
          return {
            ok: true,
            json: async () =>
              serverAuthenticated
                ? { authenticated: true, address: "0xabc", userId: "u1" }
                : { authenticated: false },
          };
        }
        throw new Error(`unexpected fetch to ${String(url)}`);
      }) as unknown as typeof fetch,
    );

    render(
      <Providers>
        <Consumer id="a" />
        <Consumer id="b" />
      </Providers>,
    );

    // Both instances start signed-out (no wallet, no session).
    await waitFor(() =>
      expect(screen.getByTestId("a-status").textContent).toBe("signed-out"),
    );
    expect(screen.getByTestId("b-status").textContent).toBe("signed-out");

    // Simulate what login()/logout() broadcast after changing the session.
    serverAuthenticated = true;
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
    });

    await waitFor(() =>
      expect(screen.getByTestId("a-status").textContent).toBe("authenticated"),
    );
    expect(screen.getByTestId("a-address").textContent).toBe("0xabc");
    expect(screen.getByTestId("b-status").textContent).toBe("authenticated");
    expect(screen.getByTestId("b-address").textContent).toBe("0xabc");

    // And back: a logout broadcast clears every instance.
    serverAuthenticated = false;
    await act(async () => {
      window.dispatchEvent(new CustomEvent(AUTH_CHANGE_EVENT));
    });

    await waitFor(() =>
      expect(screen.getByTestId("a-status").textContent).toBe("signed-out"),
    );
    expect(screen.getByTestId("b-status").textContent).toBe("signed-out");
  });
});

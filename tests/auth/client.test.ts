import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SiweMessage } from "siwe";
import {
  buildSiweMessage,
  connectErrorMessage,
  fetchAuthConfig,
  fetchSessionStatus,
  requestNonce,
  signingErrorMessage,
  SiweClientError,
  verifySiwe,
} from "@/lib/auth/client";

// NOTE: fetch is stubbed; the SIWE message construction is real and the
// result is parsed back with the real siwe parser.

const ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const mockFetch = vi.fn();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildSiweMessage", () => {
  it("builds a message that parses back with the expected fields", () => {
    const prepared = buildSiweMessage({
      address: ADDRESS,
      chainId: 1,
      nonce: "testnonce123",
    });

    const parsed = new SiweMessage(prepared);
    expect(parsed.domain).toBe(window.location.host);
    expect(parsed.uri).toBe(window.location.origin);
    expect(parsed.address).toBe(ADDRESS);
    expect(parsed.chainId).toBe(1);
    expect(parsed.nonce).toBe("testnonce123");
    expect(parsed.version).toBe("1");
    expect(parsed.statement).toContain("ChimpHood");
    // Expiration mirrors the nonce TTL (10 minutes from issuedAt).
    // Tolerance covers the milliseconds between the two Date constructions.
    const ttlMs =
      new Date(parsed.expirationTime as string).getTime() -
      new Date(parsed.issuedAt as string).getTime();
    expect(ttlMs).toBeGreaterThanOrEqual(10 * 60 * 1000 - 5000);
    expect(ttlMs).toBeLessThanOrEqual(10 * 60 * 1000 + 5000);
  });
});

describe("fetchAuthConfig", () => {
  it("returns the chain allowlist", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ allowedChainIds: [1, 137] }));
    await expect(fetchAuthConfig()).resolves.toEqual({ allowedChainIds: [1, 137] });
    expect(mockFetch).toHaveBeenCalledWith("/api/auth/config", { method: "GET" });
  });

  it("throws SiweClientError on a malformed response", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ allowedChainIds: "nope" }));
    await expect(fetchAuthConfig()).rejects.toBeInstanceOf(SiweClientError);
  });

  it("throws SiweClientError on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("down"));
    const err = await fetchAuthConfig().catch((e) => e);
    expect(err).toBeInstanceOf(SiweClientError);
    expect((err as SiweClientError).code).toBe("network_error");
  });
});

describe("requestNonce", () => {
  it("posts the address and returns the nonce", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ nonce: "abc123", expiresAt: "2030-01-01T00:00:00.000Z" }),
    );
    await expect(requestNonce(ADDRESS)).resolves.toEqual({
      nonce: "abc123",
      expiresAt: "2030-01-01T00:00:00.000Z",
    });
    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(init.body).toContain(ADDRESS);
  });

  it("maps 429 to rate_limited", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 429));
    const err = await requestNonce(ADDRESS).catch((e) => e);
    expect(err).toBeInstanceOf(SiweClientError);
    expect((err as SiweClientError).code).toBe("rate_limited");
  });
});

describe("verifySiwe", () => {
  it("returns address and userId on success", async () => {
    mockFetch.mockResolvedValue(jsonResponse({ address: "0xabc", userId: "u1" }));
    await expect(verifySiwe("msg", "sig")).resolves.toEqual({
      address: "0xabc",
      userId: "u1",
    });
  });

  it("maps 403 to suspended", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 403));
    const err = await verifySiwe("msg", "sig").catch((e) => e);
    expect((err as SiweClientError).code).toBe("suspended");
  });

  it("maps 401 to a generic verify_failed", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}, 401));
    const err = await verifySiwe("msg", "sig").catch((e) => e);
    expect(err).toBeInstanceOf(SiweClientError);
    expect((err as SiweClientError).code).toBe("verify_failed");
  });
});

describe("fetchSessionStatus", () => {
  it("returns the session when authenticated", async () => {
    mockFetch.mockResolvedValue(
      jsonResponse({ authenticated: true, address: "0xabc", userId: "u1" }),
    );
    await expect(fetchSessionStatus()).resolves.toEqual({
      authenticated: true,
      address: "0xabc",
      userId: "u1",
    });
  });

  it("returns unauthenticated on network failure", async () => {
    mockFetch.mockRejectedValue(new Error("down"));
    await expect(fetchSessionStatus()).resolves.toEqual({ authenticated: false });
  });
});

describe("error message mapping", () => {
  it("signingErrorMessage detects user rejection", () => {
    expect(signingErrorMessage({ code: 4001 })).toContain("cancelled");
    expect(signingErrorMessage(new Error("User rejected the request"))).toContain(
      "cancelled",
    );
    expect(signingErrorMessage(new Error("boom"))).toContain("Could not get a signature");
  });

  it("connectErrorMessage detects a missing wallet", () => {
    expect(connectErrorMessage(new Error("No provider found"))).toContain(
      "No wallet detected",
    );
    expect(connectErrorMessage({ code: 4001 })).toContain("cancelled");
  });

  it("connectErrorMessage names the chosen wallet when it is not detected", () => {
    expect(connectErrorMessage(new Error("Provider not found."), "MetaMask")).toContain(
      "MetaMask was not detected",
    );
  });
});

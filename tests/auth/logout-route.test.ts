import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/logout/route";

// NOTE: session helpers are mocked; the DB client import is stubbed.
// What IS real: revoke-before-destroy ordering and the always-200 contract.

const { mockGetSessionData, mockRevokeSessionToken, mockDestroySessionCookie } =
  vi.hoisted(() => ({
    mockGetSessionData: vi.fn(),
    mockRevokeSessionToken: vi.fn(),
    mockDestroySessionCookie: vi.fn(),
  }));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return {
    ...actual,
    getSessionData: mockGetSessionData,
    revokeSessionToken: mockRevokeSessionToken,
    destroySessionCookie: mockDestroySessionCookie,
  };
});
vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    mockGetSessionData.mockReset();
    mockRevokeSessionToken.mockReset();
    mockDestroySessionCookie.mockReset();
  });

  it("revokes the session token and destroys the cookie", async () => {
    mockGetSessionData.mockResolvedValue({
      userId: "u1",
      address: "0xabc",
      token: "raw-token",
    });

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(mockRevokeSessionToken).toHaveBeenCalledTimes(1);
    expect(mockRevokeSessionToken).toHaveBeenCalledWith({ __fake: true }, "raw-token");
    expect(mockDestroySessionCookie).toHaveBeenCalledTimes(1);
  });

  it("is idempotent when there is no session", async () => {
    mockGetSessionData.mockResolvedValue(null);

    const res = await POST();

    expect(res.status).toBe(200);
    expect(mockRevokeSessionToken).not.toHaveBeenCalled();
    expect(mockDestroySessionCookie).toHaveBeenCalledTimes(1);
  });

  it("still returns 200 when revocation throws", async () => {
    mockGetSessionData.mockRejectedValue(new Error("boom"));

    const res = await POST();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

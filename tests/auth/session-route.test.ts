import { describe, it, expect, vi } from "vitest";
import { GET } from "@/app/api/auth/session/route";

// NOTE: authenticateRequest is mocked; the DB client import is stubbed.
// What IS real: response shape and status mapping.

const { mockAuthenticateRequest } = vi.hoisted(() => ({
  mockAuthenticateRequest: vi.fn(),
}));

vi.mock("@/server/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/auth/session")>();
  return { ...actual, authenticateRequest: mockAuthenticateRequest };
});
vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

describe("GET /api/auth/session", () => {
  // NOTE: no mockReset() in beforeEach — each test sets its own
  // mockResolvedValue/mockRejectedValue, which fully replaces the
  // implementation. (A vitest harness quirk turns mockClear/mockReset +
  // mockRejectedValue into a false "unhandled error" failure.)

  it("returns the session when authenticated", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      sessionId: "s1",
      userId: "u1",
      address: "0xabc",
    });

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      authenticated: true,
      address: "0xabc",
      userId: "u1",
    });
  });

  it("returns authenticated:false when there is no session", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);

    const res = await GET();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ authenticated: false });
  });

  it("returns authenticated:false with 500 on errors", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("db down"));

    const res = await GET();

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ authenticated: false });
  });
});

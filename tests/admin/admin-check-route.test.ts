import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/admin/check/route";

const mockCheckAdminSession = vi.fn();
vi.mock("@/server/auth/session", () => ({
  checkAdminSession: (...args: unknown[]) => mockCheckAdminSession(...args),
}));

vi.mock("@/server/db", () => ({
  prisma: { __mockDb: true },
}));

describe("GET /api/admin/check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns isAdmin:false when visitor is unauthenticated (401)", async () => {
    mockCheckAdminSession.mockResolvedValueOnce({
      ok: false,
      error: "UNAUTHORIZED",
      status: 401,
      message: "Authentication required to access admin resources.",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isAdmin: false, roleType: null });
  });

  it("returns isAdmin:false when visitor has no admin role (403)", async () => {
    mockCheckAdminSession.mockResolvedValueOnce({
      ok: false,
      error: "FORBIDDEN",
      status: 403,
      message: "Admin access required. No admin role assigned to this account.",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isAdmin: false, roleType: null });
  });

  it("returns isAdmin:true with roleType when authenticated as SUPER_ADMIN", async () => {
    mockCheckAdminSession.mockResolvedValueOnce({
      ok: true,
      session: {
        sessionId: "s-1",
        userId: "u-1",
        address: "0xcf51dbba6a82c2ed1f0a6ff9dacd803298693ae9",
        adminRole: {
          id: "r-1",
          userId: "u-1",
          roleType: "SUPER_ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ isAdmin: true, roleType: "SUPER_ADMIN" });
  });
});

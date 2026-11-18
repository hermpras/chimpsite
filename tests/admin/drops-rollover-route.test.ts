import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST, GET } from "@/app/api/admin/drops/rollover/route";
import { AdminAuthError } from "@/server/auth/session";

const {
  mockRequireAdminSession,
  mockEnsureActiveCyclePeriod,
  mockDropFindUnique,
  mockAcquireLock,
  mockReleaseLock,
} = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockEnsureActiveCyclePeriod: vi.fn(),
  mockDropFindUnique: vi.fn(),
  mockAcquireLock: vi.fn(),
  mockReleaseLock: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    drop: {
      findUnique: mockDropFindUnique,
    },
  },
}));

vi.mock("@/server/auth/session", () => ({
  requireAdminSession: mockRequireAdminSession,
  AdminAuthError: class MockAdminAuthError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 403) {
      super(message);
      this.code = code;
      this.status = status;
    }
    toResponse() {
      return Response.json(
        { error: this.code, message: this.message },
        { status: this.status },
      );
    }
  },
}));

vi.mock("@/server/drops/auto-replenish", () => ({
  ensureActiveCyclePeriod: mockEnsureActiveCyclePeriod,
}));

vi.mock("@/lib/redis/lock", () => ({
  acquireDistributedLock: mockAcquireLock,
  releaseDistributedLock: mockReleaseLock,
  getDropReplenishLockKey: vi.fn().mockReturnValue("drops:lock:drop-1"),
}));

describe("POST /api/admin/drops/rollover", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSession.mockResolvedValue({ id: "admin-1", role: "SUPER_ADMIN" });
    mockAcquireLock.mockResolvedValue({ status: "ACQUIRED", token: "lock-token-abc" });
    mockReleaseLock.mockResolvedValue(true);
  });

  it("returns 405 on GET", async () => {
    const res = await GET();
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toBe("POST");
  });

  it("returns 403 if admin authentication fails", async () => {
    mockRequireAdminSession.mockRejectedValue(
      new AdminAuthError("FORBIDDEN", "Requires MANAGE_DROPS", 403),
    );

    const req = new Request("http://localhost:3000/api/admin/drops/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "drop-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("FORBIDDEN");
  });

  it("returns 400 when dropId is missing", async () => {
    const req = new Request("http://localhost:3000/api/admin/drops/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("INVALID_INPUT");
  });

  it("returns 404 when drop does not exist", async () => {
    mockDropFindUnique.mockResolvedValue(null);

    const req = new Request("http://localhost:3000/api/admin/drops/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "nonexistent-drop" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data.error).toBe("NOT_FOUND");
  });

  it("successfully triggers cycle rollover under distributed lock protection", async () => {
    const mockDrop = { id: "drop-1", title: "Genesis Drop", status: "ACTIVE" };
    mockDropFindUnique.mockResolvedValue(mockDrop);

    const mockPeriod = {
      id: "period-new",
      periodIndex: 42,
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 7200000),
      status: "ACTIVE",
      poolItems: [
        { id: "pi-1", remainingStock: 5 },
        { id: "pi-2", remainingStock: 10 },
      ],
    };
    mockEnsureActiveCyclePeriod.mockResolvedValue(mockPeriod);

    const req = new Request("http://localhost:3000/api/admin/drops/rollover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dropId: "drop-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.success).toBe(true);
    expect(data.message).toContain("Active period is #42");
    expect(data.period.periodIndex).toBe(42);
    expect(data.period.totalStock).toBe(15);

    expect(mockAcquireLock).toHaveBeenCalledWith("drops:lock:drop-1", 15);
    expect(mockEnsureActiveCyclePeriod).toHaveBeenCalledWith(
      expect.anything(),
      mockDrop,
      expect.any(Date),
    );
    expect(mockReleaseLock).toHaveBeenCalledWith("drops:lock:drop-1", "lock-token-abc");
  });
});

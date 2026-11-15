import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/drops/user-status/route";

const {
  mockDropFindFirst,
  mockDropPeriodFindFirst,
  mockClaimFindFirst,
  mockAuthenticateRequest,
  mockCheckUserDropEligibility,
} = vi.hoisted(() => ({
  mockDropFindFirst: vi.fn(),
  mockDropPeriodFindFirst: vi.fn(),
  mockClaimFindFirst: vi.fn(),
  mockAuthenticateRequest: vi.fn(),
  mockCheckUserDropEligibility: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: mockAuthenticateRequest,
}));

vi.mock("@/server/drops/claim", () => ({
  checkUserDropEligibility: mockCheckUserDropEligibility,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    drop: {
      findFirst: mockDropFindFirst,
    },
    dropPeriod: {
      findFirst: mockDropPeriodFindFirst,
    },
    claim: {
      findFirst: mockClaimFindFirst,
    },
  },
}));

describe("GET /api/drops/user-status (Private User Status Endpoint)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns { authenticated: false } with private no-store headers for anonymous callers", async () => {
    mockAuthenticateRequest.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const data = await res.json();
    expect(data).toEqual({ authenticated: false });
    expect(mockCheckUserDropEligibility).not.toHaveBeenCalled();
    expect(mockClaimFindFirst).not.toHaveBeenCalled();
  });

  it("handles authenticateRequest rejection safely and returns { authenticated: false }", async () => {
    mockAuthenticateRequest.mockRejectedValue(new Error("Invalid session token"));

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const data = await res.json();
    expect(data).toEqual({ authenticated: false });
  });

  it("returns authenticated: true and userEligibility: null when no active drop exists", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: "user-1",
      address: "0x1234567890123456789012345678901234567890",
      sessionId: "sess-1",
    });
    mockDropFindFirst.mockResolvedValue(null);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const data = await res.json();
    expect(data).toEqual({
      authenticated: true,
      userHasClaimed: false,
      userEligibility: null,
    });
  });

  it("returns live user eligibility and userHasClaimed: false when user has not claimed in active period", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: "user-eligible",
      address: "0x1234567890123456789012345678901234567890",
      sessionId: "sess-1",
    });
    mockDropFindFirst.mockResolvedValue({ id: "drop-1", status: "ACTIVE" });
    mockDropPeriodFindFirst.mockResolvedValue({ id: "period-1", dropId: "drop-1" });
    mockClaimFindFirst.mockResolvedValue(null);

    const mockEligibility = {
      isEligible: true,
      hasWallet: true,
      hasLinkedX: true,
      xUsername: "elychimp_holder",
      totalMandatoryTasksCount: 5,
      completedMandatoryTasksCount: 5,
      areMandatoryTasksCompleted: true,
      isBanned: false,
      hasAllocatedSlot: true,
      missingRequirements: [],
    };
    mockCheckUserDropEligibility.mockResolvedValue(mockEligibility);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const data = await res.json();
    expect(data.authenticated).toBe(true);
    expect(data.userHasClaimed).toBe(false);
    expect(data.userEligibility).toEqual(mockEligibility);
    expect(mockCheckUserDropEligibility).toHaveBeenCalledWith(
      expect.anything(),
      "user-eligible",
      expect.any(Date),
    );
    expect(mockClaimFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-eligible",
        periodId: "period-1",
      },
      select: { id: true },
    });
  });

  it("returns userHasClaimed: true when user already claimed in the active period", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: "user-claimed",
      address: "0x1234567890123456789012345678901234567890",
      sessionId: "sess-2",
    });
    mockDropFindFirst.mockResolvedValue({ id: "drop-1", status: "ACTIVE" });
    mockDropPeriodFindFirst.mockResolvedValue({ id: "period-1", dropId: "drop-1" });
    mockClaimFindFirst.mockResolvedValue({ id: "claim-xyz" });

    const mockEligibility = {
      isEligible: true,
      hasWallet: true,
      hasLinkedX: true,
      xUsername: "super_chimp",
      totalMandatoryTasksCount: 5,
      completedMandatoryTasksCount: 5,
      areMandatoryTasksCompleted: true,
      isBanned: false,
      hasAllocatedSlot: true,
      missingRequirements: [],
    };
    mockCheckUserDropEligibility.mockResolvedValue(mockEligibility);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const data = await res.json();
    expect(data.authenticated).toBe(true);
    expect(data.userHasClaimed).toBe(true);
    expect(data.userEligibility).toEqual(mockEligibility);
  });

  it("returns 500 with private no-store headers on unexpected database error", async () => {
    mockAuthenticateRequest.mockResolvedValue({
      userId: "user-err",
      address: "0x1234567890123456789012345678901234567890",
      sessionId: "sess-3",
    });
    mockDropFindFirst.mockRejectedValue(new Error("Database connection timeout"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();
    expect(res.status).toBe(500);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");

    const data = await res.json();
    expect(data.error).toBe("INTERNAL_SERVER_ERROR");
    expect(data.message).toBe("Failed to retrieve user drop status.");
    spy.mockRestore();
  });
});

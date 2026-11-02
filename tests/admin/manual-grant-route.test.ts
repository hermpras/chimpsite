import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST,
  GET,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/whitelist/slots/manual-grant/route";

vi.mock("@/server/db", () => ({ prisma: { __fake: true } }));

vi.mock("@/server/auth/session", () => {
  class MockAdminAuthError extends Error {
    code: "UNAUTHORIZED" | "FORBIDDEN";
    status: 401 | 403;
    constructor(code: "UNAUTHORIZED" | "FORBIDDEN", message: string, status: 401 | 403) {
      super(message);
      this.name = "AdminAuthError";
      this.code = code;
      this.status = status;
    }
    toResponse(): Response {
      return Response.json(
        { error: this.code, message: this.message },
        { status: this.status },
      );
    }
  }

  return {
    requireAdminSession: vi.fn(),
    AdminAuthError: MockAdminAuthError,
  };
});

vi.mock("@/server/admin/manual-grant", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/manual-grant")>();
  class MockAdminManualGrantError extends Error {
    code: string;
    status: number;
    constructor(code: string, message: string, status: number = 400) {
      super(message);
      this.name = "AdminManualGrantError";
      this.code = code;
      this.status = status;
    }
  }

  return {
    ...actual,
    manualGrantGtdSlot: vi.fn(),
    AdminManualGrantError: MockAdminManualGrantError,
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { manualGrantGtdSlot, AdminManualGrantError } from "@/server/admin/manual-grant";

describe("POST /api/admin/whitelist/slots/manual-grant Route Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Method Not Allowed (405)", () => {
    it("returns 405 for GET, PUT, DELETE, PATCH, HEAD, OPTIONS", async () => {
      const getRes = await GET();
      expect(getRes.status).toBe(405);
      expect(getRes.headers.get("Allow")).toBe("POST");

      const putRes = await PUT();
      expect(putRes.status).toBe(405);

      const delRes = await DELETE();
      expect(delRes.status).toBe(405);

      const patchRes = await PATCH();
      expect(patchRes.status).toBe(405);

      const headRes = await HEAD();
      expect(headRes.status).toBe(405);

      const optRes = await OPTIONS();
      expect(optRes.status).toBe(405);
    });
  });

  describe("Authentication & RBAC", () => {
    it("returns 401 when caller is unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Missing session token.", 401),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "p1", candidateUserId: "c1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 when caller lacks ADMIN or SUPER_ADMIN role", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("FORBIDDEN", "Insufficient role level: requires ADMIN.", 403),
      );

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "p1", candidateUserId: "c1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toBe("FORBIDDEN");
    });
  });

  describe("Payload Validation", () => {
    it("returns 400 on malformed JSON", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{ bad json",
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("MALFORMED_JSON");
    });

    it("returns 400 when programId is missing", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidateUserId: "c1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain("programId is required");
    });

    it("returns 400 when candidateUserId is missing", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "p1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toContain("candidateUserId is required");
    });
  });

  describe("Successful Grant & Bounded Retry Behavior", () => {
    it("returns 200 on successful manual grant", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      vi.mocked(manualGrantGtdSlot).mockResolvedValueOnce({
        success: true,
        slot: {
          id: "slot-2",
          programId: "prog-1",
          slotNumber: 2,
          userId: "candidate-1",
          status: "ALLOCATED",
          reviewStatus: "NOT_REVIEWED",
          allocatedAt: new Date(),
          allocatedBy: "ADMIN_MANUAL",
          notes: null,
        },
        auditLogId: "audit-1",
        previousUserId: "user-old",
      });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.slot.slotNumber).toBe(2);
    });

    it("retries on transient P2034 write conflict and succeeds on second attempt", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const p2034Err: any = new Error("Transaction conflict");
      p2034Err.code = "P2034";

      vi.mocked(manualGrantGtdSlot)
        .mockRejectedValueOnce(p2034Err)
        .mockResolvedValueOnce({
          success: true,
          slot: {
            id: "slot-2",
            programId: "prog-1",
            slotNumber: 2,
            userId: "candidate-1",
            status: "ALLOCATED",
            reviewStatus: "NOT_REVIEWED",
            allocatedAt: new Date(),
            allocatedBy: "ADMIN_MANUAL",
            notes: null,
          },
          auditLogId: "audit-1",
        });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(manualGrantGtdSlot).toHaveBeenCalledTimes(2);
    });

    it("does NOT retry on P2002 on userId (fails immediately with 409 ALREADY_HOLDS_ACTIVE_SLOT)", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const p2002UserIdErr: any = new Error("Unique constraint violation on (programId, userId)");
      p2002UserIdErr.code = "P2002";
      p2002UserIdErr.meta = { target: ["programId", "userId"] };

      vi.mocked(manualGrantGtdSlot).mockRejectedValueOnce(p2002UserIdErr);

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      expect(manualGrantGtdSlot).toHaveBeenCalledTimes(1); // strictly zero retries!
      const json = await res.json();
      expect(json.error).toBe("ALREADY_HOLDS_ACTIVE_SLOT");
    });

    it("retries on P2002 collision on slotNumber and succeeds on 3rd attempt", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const p2002SlotErr: any = new Error("Unique constraint violation on (programId, slotNumber)");
      p2002SlotErr.code = "P2002";
      p2002SlotErr.meta = { target: ["programId", "slotNumber"] };

      vi.mocked(manualGrantGtdSlot)
        .mockRejectedValueOnce(p2002SlotErr)
        .mockRejectedValueOnce(p2002SlotErr)
        .mockResolvedValueOnce({
          success: true,
          slot: {
            id: "slot-3",
            programId: "prog-1",
            slotNumber: 3,
            userId: "candidate-1",
            status: "ALLOCATED",
            reviewStatus: "NOT_REVIEWED",
            allocatedAt: new Date(),
            allocatedBy: "ADMIN_MANUAL",
            notes: null,
          },
          auditLogId: "audit-1",
        });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(manualGrantGtdSlot).toHaveBeenCalledTimes(3); // retried twice, succeeded on attempt 3
    });

    it("retries on P2002 collision on queueNumber and succeeds", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const p2002QueueErr: any = new Error("Unique constraint violation on (programId, queueNumber)");
      p2002QueueErr.code = "P2002";
      p2002QueueErr.meta = { target: ["programId", "queueNumber"] };

      vi.mocked(manualGrantGtdSlot)
        .mockRejectedValueOnce(p2002QueueErr)
        .mockResolvedValueOnce({
          success: true,
          slot: {
            id: "slot-2",
            programId: "prog-1",
            slotNumber: 2,
            userId: "candidate-1",
            status: "ALLOCATED",
            reviewStatus: "NOT_REVIEWED",
            allocatedAt: new Date(),
            allocatedBy: "ADMIN_MANUAL",
            notes: null,
          },
          auditLogId: "audit-1",
        });

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      expect(manualGrantGtdSlot).toHaveBeenCalledTimes(2);
    });

    it("fails with 409 CONCURRENCY_CONFLICT after exhausting maximum 3 retry attempts", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const p2002SlotErr: any = new Error("Unique constraint violation on (programId, slotNumber)");
      p2002SlotErr.code = "P2002";
      p2002SlotErr.meta = { target: ["programId", "slotNumber"] };

      vi.mocked(manualGrantGtdSlot)
        .mockRejectedValueOnce(p2002SlotErr)
        .mockRejectedValueOnce(p2002SlotErr)
        .mockRejectedValueOnce(p2002SlotErr);

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(409);
      expect(manualGrantGtdSlot).toHaveBeenCalledTimes(3); // exactly 3 attempts
      const json = await res.json();
      expect(json.error).toBe("CONCURRENCY_CONFLICT");
    });

    it("does NOT retry on ambiguous P2002 without identifiable constraint (fails immediately with 500)", async () => {
      vi.mocked(requireAdminSession).mockResolvedValueOnce({
        sessionId: "s1",
        userId: "admin-1",
        address: "0x123",
        adminRole: {
          id: "r1",
          userId: "admin-1",
          roleType: "ADMIN",
          permissions: ["*"],
          assignedBy: null,
        },
      });

      const ambiguousP2002Err: any = new Error("Unique constraint violation");
      ambiguousP2002Err.code = "P2002";
      ambiguousP2002Err.meta = { target: ["unknown_table_constraint"] };

      vi.mocked(manualGrantGtdSlot).mockRejectedValueOnce(ambiguousP2002Err);

      const req = new Request("http://localhost:3000/api/admin/whitelist/slots/manual-grant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ programId: "prog-1", candidateUserId: "candidate-1" }),
      });

      const res = await POST(req);
      expect(res.status).toBe(500);
      expect(manualGrantGtdSlot).toHaveBeenCalledTimes(1); // strictly 0 retries
      const json = await res.json();
      expect(json.error).toBe("INTERNAL_SERVER_ERROR");
    });
  });
});

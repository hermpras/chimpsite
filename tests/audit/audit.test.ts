import { describe, it, expect, vi } from "vitest";
import { recordAuditLog } from "@/server/audit/audit";
import type { PrismaClient, Prisma } from "@prisma/client";

describe("recordAuditLog Service", () => {
  it("creates an audit log entry with all provided fields", async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: "audit-1" });
    const mockPrisma = {
      auditLog: {
        create: mockCreate,
      },
    } as unknown as PrismaClient;

    const result = await recordAuditLog(mockPrisma, {
      actorId: "user-123",
      actorIp: "127.0.0.1",
      userAgent: "Vitest/1.0",
      action: "WL_SLOT_ALLOCATED",
      entityType: "WLSlot",
      entityId: "slot-456",
      oldValues: { status: "WAITING" },
      newValues: { status: "ALLOCATED", slotNumber: 1 },
      metadata: { programId: "prog-1" },
    });

    expect(result).toEqual({ id: "audit-1" });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        actorId: "user-123",
        actorIp: "127.0.0.1",
        userAgent: "Vitest/1.0",
        action: "WL_SLOT_ALLOCATED",
        entityType: "WLSlot",
        entityId: "slot-456",
        oldValues: { status: "WAITING" },
        newValues: { status: "ALLOCATED", slotNumber: 1 },
        metadata: { programId: "prog-1" },
      },
      select: { id: true },
    });
  });

  it("handles null and undefined optional values cleanly", async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: "audit-2" });
    const mockPrisma = {
      auditLog: {
        create: mockCreate,
      },
    } as unknown as PrismaClient;

    await recordAuditLog(mockPrisma, {
      action: "DROP_CLAIM_MINTED",
      entityType: "Claim",
      entityId: "claim-789",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        actorId: null,
        actorIp: null,
        userAgent: null,
        action: "DROP_CLAIM_MINTED",
        entityType: "Claim",
        entityId: "claim-789",
        oldValues: undefined,
        newValues: undefined,
        metadata: undefined,
      },
      select: { id: true },
    });
  });

  it("propagates database write failures to the caller (no silent null swallow)", async () => {
    const dbError = new Error("connection lost");
    const mockCreate = vi.fn().mockRejectedValue(dbError);
    const mockPrisma = {
      auditLog: {
        create: mockCreate,
      },
    } as unknown as PrismaClient;

    await expect(
      recordAuditLog(mockPrisma, {
        action: "WL_SLOT_ALLOCATED",
        entityType: "WLSlot",
        entityId: "slot-1",
      }),
    ).rejects.toThrow("connection lost");
  });

  it("writes through the transaction client supplied by the caller", async () => {
    // A transaction client is structurally identical to PrismaClient for
    // model accessors; this test verifies that the same client instance is
    // used (no re-routing through a separate PrismaClient).
    const mockCreate = vi.fn().mockResolvedValue({ id: "audit-tx-1" });
    const txClient = {
      auditLog: {
        create: mockCreate,
      },
    } as unknown as Prisma.TransactionClient;

    const result = await recordAuditLog(txClient, {
      actorId: "admin-1",
      action: "WL_SLOT_REVOKED",
      entityType: "WLSlot",
      entityId: "slot-99",
    });

    expect(result).toEqual({ id: "audit-tx-1" });
    // The create was called on the transaction client, not on a separate connection.
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("allows the enclosing business transaction to roll back when audit write fails", async () => {
    // Simulates a Prisma $transaction callback: if recordAuditLog throws,
    // the surrounding transaction should receive the rejection and roll back.
    const dbError = new Error("audit table locked");
    const txClient = {
      auditLog: {
        create: vi.fn().mockRejectedValue(dbError),
      },
    } as unknown as Prisma.TransactionClient;

    // The caller's transaction callback receives the rejection.
    let caughtError: unknown;
    try {
      await (async (tx: Prisma.TransactionClient) => {
        // Simulate business logic followed by audit write
        await recordAuditLog(tx, {
          action: "WL_SLOT_ALLOCATED",
          entityType: "WLSlot",
          entityId: "slot-rollback",
        });
      })(txClient);
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBe(dbError);
  });
});

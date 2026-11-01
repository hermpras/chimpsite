import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  lockWlProgramForUpdate,
  acquireProgramCapacityGuard,
} from "@/server/whitelist/capacity-guard";
import { WhitelistError } from "@/server/whitelist/qualification";

describe("Shared Capacity Guard & Lock Order (Unit)", () => {
  let mockStore: {
    programs: any[];
    slots: any[];
  };

  let mockTx: any;

  beforeEach(() => {
    mockStore = {
      programs: [
        {
          id: "program-open",
          slug: "open-program",
          name: "Open Program",
          totalSlots: 5,
          allocatedSlotsCount: 2,
          status: "OPEN",
        },
        {
          id: "program-full",
          slug: "full-program",
          name: "Full Program",
          totalSlots: 5,
          allocatedSlotsCount: 5,
          status: "OPEN",
        },
        {
          id: "program-paused",
          slug: "paused-program",
          name: "Paused Program",
          totalSlots: 5,
          allocatedSlotsCount: 1,
          status: "PAUSED",
        },
      ],
      slots: [
        { id: "s1", programId: "program-open", slotNumber: 1, status: "ALLOCATED" },
        { id: "s2", programId: "program-open", slotNumber: 2, status: "ALLOCATED" },
        { id: "s3", programId: "program-full", slotNumber: 1, status: "CONFIRMED" },
        { id: "s4", programId: "program-full", slotNumber: 2, status: "ALLOCATED" },
        { id: "s5", programId: "program-full", slotNumber: 3, status: "ALLOCATED" },
        { id: "s6", programId: "program-full", slotNumber: 4, status: "CONFIRMED" },
        { id: "s7", programId: "program-full", slotNumber: 5, status: "ALLOCATED" },
      ],
    };

    mockTx = {
      $queryRaw: vi.fn(async (strings: TemplateStringsArray, ...values: any[]) => {
        const query = strings.join("?");
        if (query.includes('FROM "WLProgram"') || query.includes("FROM WLProgram")) {
          const programId = values[0];
          const program = mockStore.programs.find((p) => p.id === programId);
          return program ? [{ ...program }] : [];
        }
        return [];
      }),
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return mockStore.programs.find((p) => p.id === where.id) || null;
        }),
      },
      wLSlot: {
        count: vi.fn(async ({ where }: any) => {
          return mockStore.slots.filter(
            (s) =>
              s.programId === where.programId &&
              (!where.status?.in || where.status.in.includes(s.status)),
          ).length;
        }),
      },
    };
  });

  it("locks WLProgram using $queryRaw FOR UPDATE when available", async () => {
    const program = await lockWlProgramForUpdate(mockTx, "program-open");
    expect(mockTx.$queryRaw).toHaveBeenCalled();
    expect(program.id).toBe("program-open");
    expect(program.totalSlots).toBe(5);
  });

  it("falls back to findUnique only when $queryRaw is completely undefined", async () => {
    delete mockTx.$queryRaw;
    const program = await lockWlProgramForUpdate(mockTx, "program-open");
    expect(mockTx.wLProgram.findUnique).toHaveBeenCalledWith({
      where: { id: "program-open" },
    });
    expect(program.id).toBe("program-open");
  });

  it("fails closed (rethrows error) and does not fallback when $queryRaw fails during lock acquisition", async () => {
    mockTx.$queryRaw = vi.fn().mockRejectedValue(new Error("Deadlock or lock timeout while acquiring FOR UPDATE lock"));

    await expect(
      lockWlProgramForUpdate(mockTx, "program-open"),
    ).rejects.toThrow("Deadlock or lock timeout while acquiring FOR UPDATE lock");

    // findUnique MUST NOT be called as fallback when $queryRaw fails
    expect(mockTx.wLProgram.findUnique).not.toHaveBeenCalled();
  });

  it("throws 404 PROGRAM_NOT_FOUND when program does not exist", async () => {
    await expect(
      lockWlProgramForUpdate(mockTx, "non-existent-program"),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "PROGRAM_NOT_FOUND",
        status: 404,
      }),
    );
  });

  it("evaluates capacity correctly when slots are available", async () => {
    const guard = await acquireProgramCapacityGuard(mockTx, "program-open");
    expect(guard.hasCapacity).toBe(true);
    expect(guard.remainingSlots).toBe(3);
    expect(guard.effectiveAllocatedCount).toBe(2);
  });

  it("evaluates capacity correctly when program is completely full", async () => {
    const guard = await acquireProgramCapacityGuard(mockTx, "program-full");
    expect(guard.hasCapacity).toBe(false);
    expect(guard.remainingSlots).toBe(0);
    expect(guard.effectiveAllocatedCount).toBe(5);
  });

  it("throws 400 PROGRAM_NOT_ACTIVE when requireOpen is specified and program is not open", async () => {
    await expect(
      acquireProgramCapacityGuard(mockTx, "program-paused", { requireOpen: true }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "PROGRAM_NOT_ACTIVE",
        status: 400,
      }),
    );
  });

  it("fails closed in acquireProgramCapacityGuard if lock acquisition fails, preventing capacity evaluation", async () => {
    mockTx.$queryRaw = vi.fn().mockRejectedValue(new Error("Connection aborted during SELECT FOR UPDATE"));

    await expect(
      acquireProgramCapacityGuard(mockTx, "program-open"),
    ).rejects.toThrow("Connection aborted during SELECT FOR UPDATE");

    // WLSlot count must never be evaluated if lock acquisition failed
    expect(mockTx.wLSlot.count).not.toHaveBeenCalled();
  });

  it("aborts entire allocation flow and creates no slot when lock acquisition fails", async () => {
    const slotCreateSpy = vi.fn();
    const programUpdateSpy = vi.fn();

    const txClient: any = {
      $queryRaw: vi.fn().mockRejectedValue(new Error("Lock acquisition error: 40P01 deadlock detected")),
      wLProgram: {
        update: programUpdateSpy,
        findUnique: vi.fn(),
      },
      wLSlot: {
        create: slotCreateSpy,
        count: vi.fn().mockResolvedValue(0),
      },
    };

    // Attempting allocation flow
    const attemptAllocation = async () => {
      // 1. Must acquire lock first
      const program = await lockWlProgramForUpdate(txClient, "program-open");
      // 2. Subsequent allocation steps (which should never be reached)
      await txClient.wLSlot.create({ data: { programId: program.id, slotNumber: 1 } });
      await txClient.wLProgram.update({ where: { id: program.id }, data: { allocatedSlotsCount: { increment: 1 } } });
    };

    await expect(attemptAllocation()).rejects.toThrow("Lock acquisition error: 40P01 deadlock detected");

    // Verify slot creation and program update were NEVER called
    expect(slotCreateSpy).not.toHaveBeenCalled();
    expect(programUpdateSpy).not.toHaveBeenCalled();
    expect(txClient.wLProgram.findUnique).not.toHaveBeenCalled();
  });
});

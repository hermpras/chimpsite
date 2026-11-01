import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  registerParticipantInDirectory,
  isQueueNumberCollision,
  ParticipantRegistrationError,
} from "@/server/whitelist/participant-registration";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    users: [] as any[],
    wlPrograms: [] as any[],
    wlQueueEntries: [] as any[],
    wlStatusHistories: [] as any[],
  };

  const prisma: any = {
    _store: store,
    user: {
      findUnique: vi.fn(async ({ where }: any) => {
        return store.users.find((u) => u.id === where.id) || null;
      }),
    },
    wLProgram: {
      findFirst: vi.fn(async ({ where }: any) => {
        return store.wlPrograms.find((p) => !where?.status || p.status === where.status) || null;
      }),
      findUnique: vi.fn(async ({ where }: any) => {
        return store.wlPrograms.find((p) => p.id === where.id) || null;
      }),
    },
    wLQueueEntry: {
      findUnique: vi.fn(async ({ where }: any) => {
        return (
          store.wlQueueEntries.find(
            (qe) =>
              qe.programId === where.programId_userId?.programId &&
              qe.userId === where.programId_userId?.userId,
          ) || null
        );
      }),
      findFirst: vi.fn(async ({ where, orderBy }: any) => {
        const matches = store.wlQueueEntries.filter(
          (qe) => qe.programId === where.programId,
        );
        if (orderBy?.queueNumber === "desc") {
          matches.sort((a, b) => b.queueNumber - a.queueNumber);
        }
        return matches[0] || null;
      }),
      create: vi.fn(async ({ data }: any) => {
        const conflictUser = store.wlQueueEntries.find(
          (qe) => qe.programId === data.programId && qe.userId === data.userId,
        );
        if (conflictUser) {
          const err: any = new Error("Unique constraint violation on (programId, userId)");
          err.code = "P2002";
          err.meta = { target: ["programId", "userId"] };
          throw err;
        }

        const conflictQueueNum = store.wlQueueEntries.find(
          (qe) => qe.programId === data.programId && qe.queueNumber === data.queueNumber,
        );
        if (conflictQueueNum) {
          const err: any = new Error("Unique constraint violation on (programId, queueNumber)");
          err.code = "P2002";
          err.meta = { target: ["programId", "queueNumber"] };
          throw err;
        }

        const entry = { id: `qe_${Date.now()}_${Math.random()}`, ...data };
        store.wlQueueEntries.push(entry);
        return entry;
      }),
    },
    wLStatusHistory: {
      create: vi.fn(async ({ data }: any) => {
        store.wlStatusHistories.push(data);
        return data;
      }),
    },
    $transaction: vi.fn(async (cb: any) => cb(prisma)),
  };

  return prisma;
}

describe("FCFS Directory Participant Auto-Registration (DEC-013, DEC-017)", () => {
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    mockPrisma._store.wlPrograms.push({
      id: "prog-genesis",
      slug: "genesis",
      status: "OPEN",
      totalSlots: 100,
      allocatedSlotsCount: 0,
      createdAt: new Date(),
    });
  });

  describe("Prerequisites & Unconditional Registration", () => {
    it("rejects registration if userId is empty", async () => {
      await expect(
        registerParticipantInDirectory(mockPrisma, { userId: "" }),
      ).rejects.toMatchObject({
        code: "USER_ID_REQUIRED",
        status: 400,
      });
    });

    it("rejects registration if user is not found", async () => {
      await expect(
        registerParticipantInDirectory(mockPrisma, { userId: "user-unknown" }),
      ).rejects.toMatchObject({
        code: "USER_NOT_FOUND",
        status: 404,
      });
    });

    it("rejects registration if user lacks connected EVM wallet", async () => {
      mockPrisma._store.users.push({
        id: "user-no-wallet",
        wallet: null,
        xIdentity: { xId: "x-123", username: "chimp_fan" },
      });

      await expect(
        registerParticipantInDirectory(mockPrisma, { userId: "user-no-wallet" }),
      ).rejects.toMatchObject({
        code: "WALLET_REQUIRED",
        status: 400,
      });
    });

    it("rejects registration if user lacks connected X identity", async () => {
      mockPrisma._store.users.push({
        id: "user-no-x",
        wallet: { address: "0x1111111111111111111111111111111111111111" },
        xIdentity: null,
      });

      await expect(
        registerParticipantInDirectory(mockPrisma, { userId: "user-no-x" }),
      ).rejects.toMatchObject({
        code: "X_IDENTITY_REQUIRED",
        status: 400,
      });
    });

    it("successfully registers user with Wallet + X unconditionally (even with 0 traits or 0 tasks)", async () => {
      mockPrisma._store.users.push({
        id: "user-newbie",
        wallet: { address: "0x2222222222222222222222222222222222222222" },
        xIdentity: { xId: "x-222", username: "new_chimp" },
      });

      const res = await registerParticipantInDirectory(mockPrisma, {
        userId: "user-newbie",
      });

      expect(res.isNewRegistration).toBe(true);
      expect(res.entry.userId).toBe("user-newbie");
      expect(res.entry.queueNumber).toBe(1);
      expect(res.entry.status).toBe("WAITING");

      // Verifies status history was created
      const history = mockPrisma._store.wlStatusHistories.find(
        (h: any) => h.userId === "user-newbie",
      );
      expect(history).toBeDefined();
      expect(history.action).toBe("FCFS_DIRECTORY_REGISTERED");
    });
  });

  describe("Immutability & Idempotency", () => {
    it("preserves joinedAt and queueNumber immutably across repeated registrations (idempotency)", async () => {
      const initialDate = new Date("2026-10-20T10:00:00Z");
      mockPrisma._store.users.push({
        id: "user-repeat",
        wallet: { address: "0x3333333333333333333333333333333333333333" },
        xIdentity: { xId: "x-333", username: "repeat_chimp" },
      });

      // First registration
      const firstRes = await registerParticipantInDirectory(mockPrisma, {
        userId: "user-repeat",
        now: initialDate,
      });
      expect(firstRes.isNewRegistration).toBe(true);
      expect(firstRes.entry.queueNumber).toBe(1);
      expect(firstRes.entry.joinedAt).toEqual(initialDate);

      // Second registration attempt 5 days later
      const laterDate = new Date("2026-10-25T15:00:00Z");
      const secondRes = await registerParticipantInDirectory(mockPrisma, {
        userId: "user-repeat",
        now: laterDate,
      });

      expect(secondRes.isNewRegistration).toBe(false);
      expect(secondRes.entry.queueNumber).toBe(1); // Queue number unchanged
      expect(secondRes.entry.joinedAt).toEqual(initialDate); // joinedAt NOT overwritten
    });
  });

  describe("Sequential Queue Numbers & Collision Handling", () => {
    it("assigns sequential queue numbers to distinct participants", async () => {
      mockPrisma._store.users.push(
        {
          id: "user-a",
          wallet: { address: "0xaaaa" },
          xIdentity: { xId: "x-a", username: "a" },
        },
        {
          id: "user-b",
          wallet: { address: "0xbbbb" },
          xIdentity: { xId: "x-b", username: "b" },
        },
      );

      const resA = await registerParticipantInDirectory(mockPrisma, { userId: "user-a" });
      const resB = await registerParticipantInDirectory(mockPrisma, { userId: "user-b" });

      expect(resA.entry.queueNumber).toBe(1);
      expect(resB.entry.queueNumber).toBe(2);
    });

    it("detects queueNumber collision correctly via isQueueNumberCollision helper", () => {
      const collisionErr = {
        code: "P2002",
        meta: { target: ["programId", "queueNumber"] },
      };
      expect(isQueueNumberCollision(collisionErr)).toBe(true);

      const userIdErr = {
        code: "P2002",
        meta: { target: ["programId", "userId"] },
      };
      expect(isQueueNumberCollision(userIdErr)).toBe(false);
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sendGift,
  acceptGift,
  rejectOrCancelGift,
  sweepExpiredGifts,
  GiftError,
  GIFT_EXPIRY_MS,
} from "@/server/inventory/gift";
import type { PrismaClient } from "@prisma/client";

function createMockPrisma() {
  const store = {
    bans: [] as any[],
    gifts: [] as any[],
    inventoryItems: [] as any[],
    traits: [] as any[],
    users: [] as any[],
    auditLogs: [] as any[],
  };

  const hooks = {
    onAuditCreate: null as ((data: any) => Promise<void> | void) | null,
  };

  const banRecord = {
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        store.bans.find(
          (b) =>
            b.userId === where.userId &&
            b.isActive &&
            (!where.scope?.in || where.scope.in.includes(b.scope)),
        ) || null
      );
    }),
  };

  const gift = {
    findFirst: vi.fn(async ({ where }: any) => {
      return (
        store.gifts.find((g) => {
          if (g.senderId !== where.senderId) return false;
          if (where.createdAt?.gte && g.createdAt < where.createdAt.gte) return false;
          if (where.createdAt?.lt && g.createdAt >= where.createdAt.lt) return false;
          return true;
        }) || null
      );
    }),
    findUnique: vi.fn(async ({ where }: any) => {
      const g = store.gifts.find((item) => item.id === where.id);
      if (!g) return null;
      const item = store.inventoryItems.find((i) => i.id === g.inventoryItemId);
      return { ...g, inventoryItem: item };
    }),
    findMany: vi.fn(async ({ where }: any) => {
      return store.gifts.filter((g) => {
        if (where.status && g.status !== where.status) return false;
        if (where.expiresAt?.lt && g.expiresAt >= where.expiresAt.lt) return false;
        return true;
      });
    }),
    create: vi.fn(async ({ data }: any) => {
      const record = { id: `gift-${store.gifts.length + 1}`, ...data };
      store.gifts.push(record);
      return record;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const g = store.gifts.find((item) => item.id === where.id);
      if (g) Object.assign(g, data);
      return g;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const matching = store.gifts.filter((g) => {
        if (where.id && g.id !== where.id) return false;
        if (where.status && g.status !== where.status) return false;
        return true;
      });
      for (const g of matching) {
        Object.assign(g, data);
      }
      return { count: matching.length };
    }),
  };

  const inventoryItem = {
    findUnique: vi.fn(async ({ where }: any) => {
      const item = store.inventoryItems.find((i) => i.id === where.id);
      if (!item) return null;
      const trait = store.traits.find((t) => t.id === item.traitId);
      return { ...item, trait };
    }),
    count: vi.fn(async ({ where }: any) => {
      return store.inventoryItems.filter(
        (i) => i.ownerId === where.ownerId && i.traitId === where.traitId,
      ).length;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const item = store.inventoryItems.find((i) => i.id === where.id);
      if (item) Object.assign(item, data);
      return item;
    }),
  };

  const prisma: any = {
    banRecord,
    gift,
    inventoryItem,
    $transaction: vi.fn(async (cb: (txClient: any) => any) => {
      const undoStack: Array<() => void> = [];
      const tx = {
        banRecord: {
          findFirst: vi.fn(async (args: any) => prisma.banRecord.findFirst(args)),
        },
        gift: {
          findFirst: vi.fn(async (args: any) => prisma.gift.findFirst(args)),
          findUnique: vi.fn(async (args: any) => prisma.gift.findUnique(args)),
          findMany: vi.fn(async (args: any) => prisma.gift.findMany(args)),
          create: vi.fn(async ({ data }: any) => {
            const record = { id: `gift-${store.gifts.length + 1}`, ...data };
            store.gifts.push(record);
            undoStack.push(() => {
              const idx = store.gifts.indexOf(record);
              if (idx !== -1) store.gifts.splice(idx, 1);
            });
            return record;
          }),
          update: vi.fn(async ({ where, data }: any) => {
            const g = store.gifts.find((item) => item.id === where.id);
            if (g) {
              const prev = { ...g };
              Object.assign(g, data);
              undoStack.push(() => {
                Object.assign(g, prev);
              });
            }
            return g;
          }),
          updateMany: vi.fn(async ({ where, data }: any) => {
            const matching = store.gifts.filter((g) => {
              if (where.id && g.id !== where.id) return false;
              if (where.status && g.status !== where.status) return false;
              return true;
            });
            const prevs = matching.map((g) => ({ g, prev: { ...g } }));
            for (const g of matching) {
              Object.assign(g, data);
            }
            if (matching.length > 0) {
              undoStack.push(() => {
                for (const { g, prev } of prevs) {
                  Object.assign(g, prev);
                }
              });
            }
            return { count: matching.length };
          }),
        },
        inventoryItem: {
          findUnique: vi.fn(async (args: any) => prisma.inventoryItem.findUnique(args)),
          count: vi.fn(async (args: any) => prisma.inventoryItem.count(args)),
          update: vi.fn(async ({ where, data }: any) => {
            const item = store.inventoryItems.find((i) => i.id === where.id);
            if (item) {
              const prev = { ...item };
              Object.assign(item, data);
              undoStack.push(() => {
                Object.assign(item, prev);
              });
            }
            return item;
          }),
        },
        auditLog: {
          create: vi.fn(async ({ data }: any) => {
            if (hooks.onAuditCreate) {
              await hooks.onAuditCreate(data);
            }
            const r = { id: `audit-${store.auditLogs.length + 1}`, ...data };
            store.auditLogs.push(r);
            undoStack.push(() => {
              const idx = store.auditLogs.indexOf(r);
              if (idx !== -1) store.auditLogs.splice(idx, 1);
            });
            return r;
          }),
        },
      };

      try {
        return await cb(tx);
      } catch (err) {
        while (undoStack.length > 0) {
          undoStack.pop()!();
        }
        throw err;
      }
    }),
    _store: store,
    _hooks: hooks,
  };

  return prisma as unknown as PrismaClient & {
    _store: typeof store;
    _hooks: typeof hooks;
  };
}

describe("Gift Engine (Separate Inventory Workflow)", () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  const baseTime = new Date("2026-10-16T12:00:00.000Z");

  beforeEach(() => {
    mockPrisma = createMockPrisma();

    mockPrisma._store.traits.push(
      { id: "trait-hat", name: "Pirate Hat", category: "HEADWEAR" },
      { id: "trait-glasses", name: "Neon Shades", category: "EYEWEAR" },
    );

    // Sender owns 2 copies of Pirate Hat and 1 copy of Neon Shades
    mockPrisma._store.inventoryItems.push(
      {
        id: "item-hat-1",
        traitId: "trait-hat",
        ownerId: "sender-1",
        edition: 1,
        isLocked: false,
      },
      {
        id: "item-hat-2",
        traitId: "trait-hat",
        ownerId: "sender-1",
        edition: 2,
        isLocked: false,
      },
      {
        id: "item-shades-1",
        traitId: "trait-glasses",
        ownerId: "sender-1",
        edition: 1,
        isLocked: false,
      },
    );
  });

  it("enforces duplicate-only rule: sender must retain at least one copy", async () => {
    // Attempt to gift Neon Shades (sender owns only 1 copy) -> must fail
    await expect(
      sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-shades-1",
        now: baseTime,
      }),
    ).rejects.toThrow(
      "Only extra duplicate copies may be gifted; you must retain at least one copy.",
    );

    // Gifting duplicate Pirate Hat (sender owns 2 copies) -> succeeds
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    expect(gift.status).toBe("PENDING");
    // Item is locked during pending gift
    const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
    expect(item?.isLocked).toBe(true);
    expect(item?.lockReason).toBe("PENDING_GIFT");
  });

  it("rejects gift if recipient already owns that exact trait", async () => {
    // Recipient already owns a copy of Pirate Hat
    mockPrisma._store.inventoryItems.push({
      id: "item-hat-recip",
      traitId: "trait-hat",
      ownerId: "receiver-1",
      edition: 5,
      isLocked: false,
    });

    await expect(
      sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      }),
    ).rejects.toThrow("The recipient already owns this trait.");
  });

  it("enforces 1 gift sent per wallet per UTC day limit", async () => {
    await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    // Add 3rd copy so duplicate rule still passes
    mockPrisma._store.inventoryItems.push({
      id: "item-hat-3",
      traitId: "trait-hat",
      ownerId: "sender-1",
      edition: 3,
      isLocked: false,
    });

    // Second gift on the same UTC day must fail
    await expect(
      sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-2",
        inventoryItemId: "item-hat-3",
        now: new Date("2026-10-16T18:00:00.000Z"), // Same UTC day
      }),
    ).rejects.toThrow("Each wallet may send at most one gift per UTC day.");

    // Next UTC day -> allowed
    const nextDay = new Date("2026-10-17T01:00:00.000Z");
    const nextDayGift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-2",
      inventoryItemId: "item-hat-3",
      now: nextDay,
    });
    expect(nextDayGift.status).toBe("PENDING");
  });

  it("successfully accepts a gift: transfers ownership to recipient, unlocks item, and sets provenance to GIFT", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    const result = await acceptGift(mockPrisma, {
      userId: "receiver-1",
      giftId: gift.id,
      now: new Date("2026-10-16T15:00:00.000Z"),
    });

    expect(result.gift.status).toBe("ACCEPTED");
    expect(result.item.ownerId).toBe("receiver-1");
    expect(result.item.acquiredVia).toBe("GIFT");
    expect(result.item.isLocked).toBe(false);

    // Stored database item provenance is verified as GIFT
    const storedItem = mockPrisma._store.inventoryItems.find(
      (i) => i.id === "item-hat-2",
    );
    expect(storedItem?.acquiredVia).toBe("GIFT");
    expect(storedItem?.ownerId).toBe("receiver-1");
  });

  it("Task 5-C: rejects acceptance with 403 when recipient is banned with FULL_SYSTEM before acceptance", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    // Ban recipient with FULL_SYSTEM after gift was created
    mockPrisma._store.bans.push({
      id: "ban-recv-1",
      userId: "receiver-1",
      isActive: true,
      scope: "FULL_SYSTEM",
      expiresAt: null,
    });

    await expect(
      acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: gift.id,
        now: new Date("2026-10-16T15:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "GiftError",
      code: "RECEIVER_GIFT_RESTRICTED",
      status: 403,
    });
  });

  it("Task 5-C: rejects acceptance with 403 when recipient is banned with GIFT_RESTRICTED after gift was sent", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    // Add scoped ban to recipient
    mockPrisma._store.bans.push({
      id: "ban-recv-2",
      userId: "receiver-1",
      isActive: true,
      scope: "GIFT_RESTRICTED",
      expiresAt: new Date("2026-10-20T00:00:00.000Z"),
    });

    await expect(
      acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: gift.id,
        now: new Date("2026-10-16T15:00:00.000Z"),
      }),
    ).rejects.toMatchObject({
      name: "GiftError",
      code: "RECEIVER_GIFT_RESTRICTED",
      status: 403,
    });
  });

  it("Task 5-C: permits acceptance when recipient ban has already expired", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    // Add expired ban
    mockPrisma._store.bans.push({
      id: "ban-recv-expired",
      userId: "receiver-1",
      isActive: true,
      scope: "GIFT_RESTRICTED",
      expiresAt: new Date("2026-10-16T13:00:00.000Z"),
    });

    const res = await acceptGift(mockPrisma, {
      userId: "receiver-1",
      giftId: gift.id,
      now: new Date("2026-10-16T15:00:00.000Z"),
    });

    expect(res.gift.status).toBe("ACCEPTED");
    expect(res.item.ownerId).toBe("receiver-1");
  });

  it("rejects acceptance, retains EXPIRED status, and unlocks item if gift has expired (past 24h)", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    const after25Hours = new Date(baseTime.getTime() + 25 * 60 * 60 * 1000);

    let caughtError: any;
    try {
      await acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: gift.id,
        now: after25Hours,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(GiftError);
    expect(caughtError.code).toBe("GIFT_EXPIRED");
    expect(caughtError.status).toBe(410);
    expect(caughtError.message).toBe("This gift has expired after 24 hours.");

    // Transaction must commit: gift remains EXPIRED and item is unlocked
    const storedGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
    expect(storedGift?.status).toBe("EXPIRED");
    expect(storedGift?.decidedAt).toEqual(after25Hours);

    const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
    expect(item?.isLocked).toBe(false);
    expect(item?.lockReason).toBeNull();
    expect(item?.ownerId).toBe("sender-1"); // Remains with sender
  });

  it("rejects acceptance, retains REJECTED status, and unlocks item if recipient already owns the trait", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    // Recipient acquires a copy of the trait before accepting the gift
    mockPrisma._store.inventoryItems.push({
      id: "item-hat-recip-acquired",
      traitId: "trait-hat",
      ownerId: "receiver-1",
      edition: 5,
      isLocked: false,
    });

    const acceptTime = new Date("2026-10-16T14:00:00.000Z");
    let caughtError: any;
    try {
      await acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: gift.id,
        now: acceptTime,
      });
    } catch (err) {
      caughtError = err;
    }

    expect(caughtError).toBeInstanceOf(GiftError);
    expect(caughtError.code).toBe("RECIPIENT_ALREADY_OWNS_TRAIT");
    expect(caughtError.status).toBe(409);
    expect(caughtError.message).toBe(
      "You already own this trait. The gift cannot be accepted.",
    );

    // Transaction must commit: gift remains REJECTED with rejection reason and item is unlocked
    const storedGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
    expect(storedGift?.status).toBe("REJECTED");
    expect(storedGift?.rejectionReason).toBe(
      "Recipient acquired trait prior to gift acceptance.",
    );
    expect(storedGift?.decidedAt).toEqual(acceptTime);

    const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
    expect(item?.isLocked).toBe(false);
    expect(item?.lockReason).toBeNull();
    expect(item?.ownerId).toBe("sender-1"); // Returned to sender
  });

  it("unlocks item when sender cancels or recipient rejects gift", async () => {
    const gift = await sendGift(mockPrisma, {
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      now: baseTime,
    });

    await rejectOrCancelGift(mockPrisma, {
      userId: "sender-1",
      giftId: gift.id,
      action: "CANCEL",
      reason: "Sender changed mind",
    });

    const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
    expect(item?.isLocked).toBe(false);
    expect(item?.ownerId).toBe("sender-1");
  });

  it("sweeps expired gifts and unlocks items in bulk", async () => {
    mockPrisma._store.gifts.push({
      id: "gift-old",
      senderId: "sender-1",
      receiverId: "receiver-1",
      inventoryItemId: "item-hat-2",
      status: "PENDING",
      expiresAt: new Date("2026-10-15T00:00:00.000Z"),
    });
    mockPrisma._store.inventoryItems[1].isLocked = true;

    const sweep = await sweepExpiredGifts(mockPrisma, baseTime);
    expect(sweep.processedCount).toBe(1);
    expect(mockPrisma._store.inventoryItems[1].isLocked).toBe(false);
  });

  describe("Concurrent Resolution Races", () => {
    it("ensures exactly one operation succeeds when accept and cancel race concurrently", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      // Fire both resolutions concurrently
      const [res1, res2] = await Promise.allSettled([
        rejectOrCancelGift(mockPrisma, {
          userId: "sender-1",
          giftId: gift.id,
          action: "CANCEL",
          reason: "Sender cancelled",
        }),
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: gift.id,
          now: new Date("2026-10-16T15:00:00.000Z"),
        }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejected = [res1, res2].filter((r) => r.status === "rejected");

      // Exactly one succeeds, exactly one fails
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(GiftError);
      expect(rejectedError.code).toBe("GIFT_NOT_PENDING");
      expect(rejectedError.status).toBe(409);

      // Verify item state is consistent
      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.isLocked).toBe(false);
      const finalGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
      expect(["ACCEPTED", "CANCELLED"]).toContain(finalGift?.status);
    });

    it("prevents cancel from succeeding if accept transitions PENDING first during interleaved execution", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      // Recipient accepts first
      await acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: gift.id,
        now: new Date("2026-10-16T15:00:00.000Z"),
      });

      // Sender cancel fails because gift is no longer PENDING
      await expect(
        rejectOrCancelGift(mockPrisma, {
          userId: "sender-1",
          giftId: gift.id,
          action: "CANCEL",
          reason: "Sender attempts late cancel",
        }),
      ).rejects.toMatchObject({
        code: "GIFT_NOT_PENDING",
        status: 409,
      });

      // Item ownership remains with recipient and unlocked
      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.ownerId).toBe("receiver-1");
      expect(item?.isLocked).toBe(false);
      const finalGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
      expect(finalGift?.status).toBe("ACCEPTED");
    });

    it("prevents accept from succeeding if cancel transitions PENDING first during interleaved execution", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      // Sender cancels first
      await rejectOrCancelGift(mockPrisma, {
        userId: "sender-1",
        giftId: gift.id,
        action: "CANCEL",
        reason: "Sender cancelled first",
      });

      // Recipient accept fails because gift is no longer PENDING
      await expect(
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: gift.id,
          now: new Date("2026-10-16T15:00:00.000Z"),
        }),
      ).rejects.toMatchObject({
        code: "GIFT_NOT_PENDING",
        status: 409,
      });

      // Item ownership remains with sender and unlocked
      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.ownerId).toBe("sender-1");
      expect(item?.isLocked).toBe(false);
      const finalGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
      expect(finalGift?.status).toBe("CANCELLED");
    });

    it("fails second transition when both operations read PENDING concurrently but conditional update matches only one", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      // Hook findUnique so T2's initial read observes PENDING even after T1 committed
      let t2InitialRead = true;
      const originalFindUnique = mockPrisma.gift.findUnique.bind(mockPrisma.gift);

      // T1 accepts and wins conditional update
      const acceptRes = await acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: gift.id,
        now: new Date("2026-10-16T15:00:00.000Z"),
      });
      expect(acceptRes.gift.status).toBe("ACCEPTED");

      // Now hook findUnique: when T2 does its initial check, simulate it had read PENDING concurrently
      (mockPrisma.gift as any).findUnique = vi.fn(async ({ where }: any) => {
        const result = await originalFindUnique({ where });
        if (t2InitialRead && result) {
          t2InitialRead = false;
          return { ...result, status: "PENDING" };
        }
        return result;
      });

      // T2 attempts cancel having read PENDING, but updateMany(where: { status: 'PENDING' }) finds 0 rows
      await expect(
        rejectOrCancelGift(mockPrisma, {
          userId: "sender-1",
          giftId: gift.id,
          action: "CANCEL",
        }),
      ).rejects.toMatchObject({
        code: "GIFT_NOT_PENDING",
        status: 409,
      });

      // Verify recipient retains ownership and item is not modified by loser
      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.ownerId).toBe("receiver-1");
      expect(item?.isLocked).toBe(false);
    });

    it("ensures exactly one operation succeeds when two concurrent acceptGift calls race", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      const acceptTime = new Date("2026-10-16T15:00:00.000Z");
      const [res1, res2] = await Promise.allSettled([
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: gift.id,
          now: acceptTime,
        }),
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: gift.id,
          now: acceptTime,
        }),
      ]);

      const fulfilled = [res1, res2].filter((r) => r.status === "fulfilled");
      const rejected = [res1, res2].filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const rejectedError = (rejected[0] as PromiseRejectedResult).reason;
      expect(rejectedError).toBeInstanceOf(GiftError);
      expect(rejectedError.code).toBe("GIFT_NOT_PENDING");
      expect(rejectedError.status).toBe(409);

      const finalGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
      expect(finalGift?.status).toBe("ACCEPTED");

      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.ownerId).toBe("receiver-1");
      expect(item?.isLocked).toBe(false);
    });

    it("ensures only one competing resolution succeeds when expired accept races with sender cancel", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      const after25Hours = new Date(baseTime.getTime() + 25 * 60 * 60 * 1000);

      const [res1, res2] = await Promise.allSettled([
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: gift.id,
          now: after25Hours,
        }),
        rejectOrCancelGift(mockPrisma, {
          userId: "sender-1",
          giftId: gift.id,
          action: "CANCEL",
          reason: "Sender cancel",
          now: after25Hours,
        }),
      ]);

      // One wins the conditional transition from PENDING; the loser fails with GIFT_NOT_PENDING (409)
      const reasons = [res1, res2]
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason);

      const notPendingErrors = reasons.filter((err) => err?.code === "GIFT_NOT_PENDING");
      expect(notPendingErrors).toHaveLength(1);

      const finalGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
      expect(["EXPIRED", "CANCELLED"]).toContain(finalGift?.status);

      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.isLocked).toBe(false);
      expect(item?.ownerId).toBe("sender-1");
    });

    it("ensures only one competing resolution succeeds when recipient-duplicate accept races with sender cancel", async () => {
      const gift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-2",
        now: baseTime,
      });

      // Recipient acquires duplicate trait
      mockPrisma._store.inventoryItems.push({
        id: "item-hat-recip-acquired-2",
        traitId: "trait-hat",
        ownerId: "receiver-1",
        edition: 99,
        isLocked: false,
      });

      const [res1, res2] = await Promise.allSettled([
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: gift.id,
          now: new Date("2026-10-16T15:00:00.000Z"),
        }),
        rejectOrCancelGift(mockPrisma, {
          userId: "sender-1",
          giftId: gift.id,
          action: "CANCEL",
          reason: "Sender cancel",
          now: new Date("2026-10-16T15:00:00.000Z"),
        }),
      ]);

      const reasons = [res1, res2]
        .filter((r) => r.status === "rejected")
        .map((r) => (r as PromiseRejectedResult).reason);

      const notPendingErrors = reasons.filter((err) => err?.code === "GIFT_NOT_PENDING");
      expect(notPendingErrors).toHaveLength(1);

      const finalGift = mockPrisma._store.gifts.find((g) => g.id === gift.id);
      expect(["REJECTED", "CANCELLED"]).toContain(finalGift?.status);

      const item = mockPrisma._store.inventoryItems.find((i) => i.id === "item-hat-2");
      expect(item?.isLocked).toBe(false);
      expect(item?.ownerId).toBe("sender-1");
    });

    it("records GIFT_SENT and GIFT_ACCEPTED in AuditLog", async () => {
      const createdGift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-1",
        now: baseTime,
      });

      const sentLog = mockPrisma._store.auditLogs.find(
        (log: any) => log.action === "GIFT_SENT" && log.entityId === createdGift.id,
      );
      expect(sentLog).toBeDefined();
      expect(sentLog.actorId).toBe("sender-1");
      expect(sentLog.entityType).toBe("Gift");

      await acceptGift(mockPrisma, {
        userId: "receiver-1",
        giftId: createdGift.id,
        now: new Date(baseTime.getTime() + 1000),
      });

      const acceptedLog = mockPrisma._store.auditLogs.find(
        (log: any) => log.action === "GIFT_ACCEPTED" && log.entityId === createdGift.id,
      );
      expect(acceptedLog).toBeDefined();
      expect(acceptedLog.actorId).toBe("receiver-1");
      expect(acceptedLog.newValues.ownerId).toBe("receiver-1");
    });

    it("rolls back gift acceptance and item ownership when audit log creation fails", async () => {
      const createdGift = await sendGift(mockPrisma, {
        senderId: "sender-1",
        receiverId: "receiver-1",
        inventoryItemId: "item-hat-1",
        now: baseTime,
      });

      mockPrisma._hooks.onAuditCreate = (data: any) => {
        if (data.action === "GIFT_ACCEPTED") {
          throw new Error("Audit log database failure");
        }
      };

      await expect(
        acceptGift(mockPrisma, {
          userId: "receiver-1",
          giftId: createdGift.id,
          now: new Date(baseTime.getTime() + 1000),
        }),
      ).rejects.toThrow("Audit log database failure");

      const giftRecord = mockPrisma._store.gifts.find((g) => g.id === createdGift.id);
      expect(giftRecord?.status).toBe("PENDING");
      const itemRecord = mockPrisma._store.inventoryItems.find(
        (i) => i.id === "item-hat-1",
      );
      expect(itemRecord?.ownerId).toBe("sender-1");
      expect(itemRecord?.isLocked).toBe(true);

      mockPrisma._hooks.onAuditCreate = null;
    });
  });
});

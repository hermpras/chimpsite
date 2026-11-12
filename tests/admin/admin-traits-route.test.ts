import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  POST as postTrait,
  PUT as putTrait,
  DELETE as deleteTrait,
} from "@/app/api/admin/traits/route";
import {
  PUT as putTraitById,
  DELETE as deleteTraitById,
} from "@/app/api/admin/traits/[id]/route";
import { syncActiveDropPeriodPool } from "@/server/drops/auto-replenish";

const { mockRequireAdminSession, mockPrisma } = vi.hoisted(() => {
  const prismaObj: any = {
    $transaction: vi.fn(async (cb: any) => (Array.isArray(cb) ? Promise.all(cb) : cb(prismaObj))),
    auditLog: {
      create: vi.fn().mockResolvedValue({ id: "audit-1" }),
    },
    trait: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    inventoryItem: {
      count: vi.fn(),
    },
    drop: {
      findFirst: vi.fn(),
    },
    dropPeriod: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    dropPoolItem: {
      count: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    claim: {
      count: vi.fn(),
    },
  };
  return {
    mockRequireAdminSession: vi.fn(),
    mockPrisma: prismaObj,
  };
});

vi.mock("@/server/db", () => ({
  prisma: mockPrisma,
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

describe("Admin Traits Routes — Edit & Delete Suite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminSession.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
    });
  });

  describe("POST /api/admin/traits", () => {
    it("returns 400 when required fields are missing", async () => {
      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Gold Chain" }),
      });
      const res = await postTrait(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    it("successfully creates trait and records audit log", async () => {
      mockPrisma.trait.upsert.mockResolvedValue({
        id: "trait-new-1",
        slug: "gold-chain",
        name: "Gold Chain",
        category: "CLOTHING",
        rarity: "RARE",
        imageUrl: "/traits/gold-chain.png",
        isActive: true,
      });

      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Gold Chain",
          category: "CLOTHING",
          rarity: "RARE",
          imageUrl: "/traits/gold-chain.png",
        }),
      });
      const res = await postTrait(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.trait.id).toBe("trait-new-1");
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "TRAIT_CREATED",
            entityType: "Trait",
            entityId: "trait-new-1",
          }),
        }),
      );
    });
  });

  describe("PUT /api/admin/traits", () => {
    it("returns 400 when trait ID is missing", async () => {
      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Updated Name" }),
      });
      const res = await putTrait(req);
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("VALIDATION_ERROR");
    });

    it("returns 404 when trait is not found", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue(null);
      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "trait-404", name: "Updated Name" }),
      });
      const res = await putTrait(req);
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("NOT_FOUND");
    });

    it("returns 400 when category is invalid", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue({ id: "t1", name: "Old" });
      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "t1", category: "INVALID_CAT" }),
      });
      const res = await putTrait(req);
      expect(res.status).toBe(400);
    });

    it("successfully updates trait metadata and active status", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue({ id: "t1", name: "Old Name" });
      mockPrisma.trait.update.mockResolvedValue({
        id: "t1",
        name: "Cyber Halo V2",
        category: "HEADWEAR",
        rarity: "LEGENDARY",
        isActive: true,
      });

      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "t1",
          name: "Cyber Halo V2",
          category: "HEADWEAR",
          rarity: "LEGENDARY",
          isActive: true,
        }),
      });
      const res = await putTrait(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.trait.name).toBe("Cyber Halo V2");
      expect(mockPrisma.trait.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: expect.objectContaining({
          name: "Cyber Halo V2",
          category: "HEADWEAR",
          rarity: "LEGENDARY",
          isActive: true,
        }),
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "TRAIT_UPDATED",
            entityType: "Trait",
            entityId: "t1",
          }),
        }),
      );
    });
  });

  describe("DELETE /api/admin/traits", () => {
    it("returns 400 when trait ID is missing", async () => {
      const req = new Request("http://localhost:3000/api/admin/traits", {
        method: "DELETE",
      });
      const res = await deleteTrait(req);
      expect(res.status).toBe(400);
    });

    it("returns 404 when trait is not found", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue(null);
      const req = new Request("http://localhost:3000/api/admin/traits?id=missing-id", {
        method: "DELETE",
      });
      const res = await deleteTrait(req);
      expect(res.status).toBe(404);
    });

    it("safely deactivates trait if users already own inventory items", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue({ id: "t1", name: "Golden Fur" });
      mockPrisma.inventoryItem.count.mockResolvedValue(5);
      mockPrisma.trait.update.mockResolvedValue({ id: "t1", isActive: false });

      const req = new Request("http://localhost:3000/api/admin/traits?id=t1", {
        method: "DELETE",
      });
      const res = await deleteTrait(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.mode).toBe("deactivated");
      expect(mockPrisma.trait.update).toHaveBeenCalledWith({
        where: { id: "t1" },
        data: { isActive: false },
      });
      expect(mockPrisma.trait.delete).not.toHaveBeenCalled();
    });

    it("permanently deletes trait if no users own it and no claims reference it", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue({ id: "t1", name: "Unused Trait" });
      mockPrisma.inventoryItem.count.mockResolvedValue(0);
      mockPrisma.claim.count.mockResolvedValue(0);
      mockPrisma.dropPoolItem.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.trait.delete.mockResolvedValue({ id: "t1" });

      const req = new Request("http://localhost:3000/api/admin/traits?id=t1", {
        method: "DELETE",
      });
      const res = await deleteTrait(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.mode).toBe("deleted");
      expect(mockPrisma.dropPoolItem.deleteMany).toHaveBeenCalledWith({
        where: { traitId: "t1" },
      });
      expect(mockPrisma.trait.delete).toHaveBeenCalledWith({
        where: { id: "t1" },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: "TRAIT_DELETED",
            entityType: "Trait",
            entityId: "t1",
          }),
        }),
      );
    });
  });

  describe("PUT & DELETE /api/admin/traits/[id]", () => {
    it("updates trait via param route", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue({ id: "param-1", name: "Old" });
      mockPrisma.trait.update.mockResolvedValue({ id: "param-1", name: "New Name" });

      const req = new Request("http://localhost:3000/api/admin/traits/param-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "New Name" }),
      });
      const res = await putTraitById(req, {
        params: Promise.resolve({ id: "param-1" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });

    it("deletes trait via param route", async () => {
      mockPrisma.trait.findUnique.mockResolvedValue({ id: "param-1", name: "Old" });
      mockPrisma.inventoryItem.count.mockResolvedValue(0);
      mockPrisma.claim.count.mockResolvedValue(0);
      mockPrisma.dropPoolItem.deleteMany.mockResolvedValue({ count: 0 });
      mockPrisma.trait.delete.mockResolvedValue({ id: "param-1" });

      const req = new Request("http://localhost:3000/api/admin/traits/param-1", {
        method: "DELETE",
      });
      const res = await deleteTraitById(req, {
        params: Promise.resolve({ id: "param-1" }),
      });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.mode).toBe("deleted");
    });
  });

  describe("Real-Time Pool Synchronization (syncActiveDropPeriodPool)", () => {
    it("returns null if no active drop is found", async () => {
      mockPrisma.drop.findFirst.mockResolvedValue(null);
      const result = await syncActiveDropPeriodPool(mockPrisma as any);
      expect(result).toBeNull();
    });

    it("synchronizes active period pool when active traits exist", async () => {
      mockPrisma.drop.findFirst.mockResolvedValue({ id: "drop-1", status: "ACTIVE" });
      mockPrisma.dropPeriod.findFirst.mockResolvedValue({
        id: "period-1",
        dropId: "drop-1",
        status: "ACTIVE",
        poolItems: [
          {
            id: "pi-old",
            periodId: "period-1",
            traitId: "trait-inactive",
            claimedStock: 0,
            remainingStock: 10,
          },
        ],
      });
      mockPrisma.trait.findMany.mockResolvedValue([
        {
          id: "trait-new",
          slug: "trait-new",
          name: "Trait New",
          category: "HEADWEAR",
          rarity: "COMMON",
          isActive: true,
        },
      ]);
      mockPrisma.dropPoolItem.delete.mockResolvedValue({});
      mockPrisma.dropPoolItem.create.mockResolvedValue({});
      mockPrisma.dropPeriod.update.mockResolvedValue({});

      const result = await syncActiveDropPeriodPool(mockPrisma as any);
      expect(result).not.toBeNull();
      expect(result?.periodId).toBe("period-1");
      expect(mockPrisma.dropPoolItem.delete).toHaveBeenCalledWith({
        where: { id: "pi-old" },
      });
      expect(mockPrisma.dropPoolItem.create).toHaveBeenCalled();
      expect(mockPrisma.dropPeriod.update).toHaveBeenCalledWith({
        where: { id: "period-1" },
        data: { isStockConfigured: true },
      });
    });
  });
});

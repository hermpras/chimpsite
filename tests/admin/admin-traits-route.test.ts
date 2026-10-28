import { describe, it, expect, vi, beforeEach } from "vitest";
import { PUT as putTrait, DELETE as deleteTrait } from "@/app/api/admin/traits/route";
import {
  PUT as putTraitById,
  DELETE as deleteTraitById,
} from "@/app/api/admin/traits/[id]/route";

const { mockRequireAdminSession, mockPrisma } = vi.hoisted(() => ({
  mockRequireAdminSession: vi.fn(),
  mockPrisma: {
    trait: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    inventoryItem: {
      count: vi.fn(),
    },
    dropPoolItem: {
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
    claim: {
      count: vi.fn(),
    },
  },
}));

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
});

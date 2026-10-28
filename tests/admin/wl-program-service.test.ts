import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  createWLProgram,
  updateWLProgram,
  listWLPrograms,
  getWLProgram,
  normalizeSlug,
  AdminWLProgramError,
} from "@/server/admin/wl-program";
import { createCampaign } from "@/server/admin/campaign";

describe("Admin WL Program Service - B-2 Whitelist Program Engine", () => {
  let mockPrisma: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockPrisma = {
      wLProgram: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        count: vi.fn(),
      },
      promoCampaign: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      campaignVersion: {
        create: vi.fn(),
      },
      auditLog: {
        create: vi.fn().mockResolvedValue({ id: "audit-wl-prog-1" }),
      },
      $transaction: vi.fn(async (cb: any) => cb(mockPrisma)),
    };
  });

  describe("1. Slug Normalization", () => {
    it("normalizes mixed-case strings with spaces and special characters into clean slug format", () => {
      expect(normalizeSlug("Genesis Whitelist Season 1")).toBe(
        "genesis-whitelist-season-1",
      );
      expect(normalizeSlug("  ---ChimpHood_Special---  ")).toBe("chimphood-special");
      expect(normalizeSlug("WL#2026/Alpha!")).toBe("wl-2026-alpha");
    });
  });

  describe("2. Explicit Capacity Validation (No Invented Defaults)", () => {
    const validBaseInput = {
      name: "Season 1 Genesis WL",
      slug: "genesis-s1",
      startsAt: "2026-11-01T00:00:00.000Z",
      adminUserId: "admin-user-01",
    };

    it("strictly rejects program creation when totalSlots is undefined or null", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          ...validBaseInput,
          totalSlots: undefined as any,
        }),
      ).rejects.toThrow(
        "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0). No default capacity is allowed.",
      );

      await expect(
        createWLProgram(mockPrisma, {
          ...validBaseInput,
          totalSlots: null as any,
        }),
      ).rejects.toThrow(
        "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0). No default capacity is allowed.",
      );
    });

    it("strictly rejects program creation when totalSlots is zero or negative", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          ...validBaseInput,
          totalSlots: 0,
        }),
      ).rejects.toThrow(
        "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0)",
      );

      await expect(
        createWLProgram(mockPrisma, {
          ...validBaseInput,
          totalSlots: -50,
        }),
      ).rejects.toThrow(
        "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0)",
      );
    });

    it("strictly rejects program creation when totalSlots is a floating-point number", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          ...validBaseInput,
          totalSlots: 100.5,
        }),
      ).rejects.toThrow(
        "Capacity (totalSlots) must be explicitly specified as a positive integer (> 0)",
      );
    });

    it("accepts explicitly defined positive integer capacity", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(null);
      mockPrisma.wLProgram.create.mockResolvedValueOnce({
        id: "prog-s1",
        slug: "genesis-s1",
        name: "Season 1 Genesis WL",
        description: null,
        totalSlots: 250,
        allocatedSlotsCount: 0,
        status: "UPCOMING",
        startsAt: new Date("2026-11-01T00:00:00.000Z"),
        endsAt: null,
        createdAt: new Date("2026-10-25T10:00:00.000Z"),
        updatedAt: new Date("2026-10-25T10:00:00.000Z"),
      });

      const result = await createWLProgram(mockPrisma, {
        ...validBaseInput,
        totalSlots: 250,
      });

      expect(result.program.totalSlots).toBe(250);
      expect(result.program.allocatedSlotsCount).toBe(0);
      expect(mockPrisma.wLProgram.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          totalSlots: 250,
          allocatedSlotsCount: 0,
        }),
      });
    });
  });

  describe("3. Program Creation & Validations", () => {
    it("rejects missing or empty name", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          name: "  ",
          slug: "test-prog",
          totalSlots: 100,
          startsAt: "2026-11-01T00:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("Program name is required.");
    });

    it("rejects missing or invalid slug", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          name: "Test Prog",
          slug: "   ",
          totalSlots: 100,
          startsAt: "2026-11-01T00:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("Program slug is required.");
    });

    it("detects and rejects duplicate slug with SLUG_CONFLICT (409)", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce({ id: "existing-prog-id" });

      await expect(
        createWLProgram(mockPrisma, {
          name: "Duplicate Program",
          slug: "genesis-s1",
          totalSlots: 100,
          startsAt: "2026-11-01T00:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toMatchObject({
        code: "SLUG_CONFLICT",
        status: 409,
      });
    });

    it("validates startsAt is a valid timestamp", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          name: "Invalid Date Prog",
          slug: "invalid-date",
          totalSlots: 100,
          startsAt: "not-a-valid-date",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("Program startsAt must be a valid ISO date timestamp.");
    });

    it("validates endsAt is after startsAt if provided", async () => {
      await expect(
        createWLProgram(mockPrisma, {
          name: "Invalid Range Prog",
          slug: "invalid-range",
          totalSlots: 100,
          startsAt: "2026-11-05T00:00:00.000Z",
          endsAt: "2026-11-01T00:00:00.000Z",
          adminUserId: "admin-1",
        }),
      ).rejects.toThrow("Program endsAt must be after startsAt.");
    });

    it("validates status enum and defaults to UPCOMING if omitted", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(null);
      mockPrisma.wLProgram.create.mockResolvedValueOnce({
        id: "prog-default",
        slug: "default-status",
        name: "Default Status Prog",
        description: null,
        totalSlots: 50,
        allocatedSlotsCount: 0,
        status: "UPCOMING",
        startsAt: new Date("2026-11-01T00:00:00.000Z"),
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await createWLProgram(mockPrisma, {
        name: "Default Status Prog",
        slug: "default-status",
        totalSlots: 50,
        startsAt: "2026-11-01T00:00:00.000Z",
        adminUserId: "admin-1",
      });

      expect(res.program.status).toBe("UPCOMING");
    });
  });

  describe("4. Audit Log Recording", () => {
    it("persists comprehensive audit log on program creation", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(null);
      mockPrisma.wLProgram.create.mockResolvedValueOnce({
        id: "prog-audit-1",
        slug: "audit-test-prog",
        name: "Audit Test Program",
        description: "Testing audit trail",
        totalSlots: 300,
        allocatedSlotsCount: 0,
        status: "OPEN",
        startsAt: new Date("2026-11-01T00:00:00.000Z"),
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await createWLProgram(mockPrisma, {
        name: "Audit Test Program",
        slug: "audit-test-prog",
        description: "Testing audit trail",
        totalSlots: 300,
        status: "OPEN",
        startsAt: "2026-11-01T00:00:00.000Z",
        adminUserId: "admin-audit-user",
        ipAddress: "192.168.1.100",
        userAgent: "Vitest/Admin",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "WL_PROGRAM_CREATED",
          entityType: "WLProgram",
          entityId: "prog-audit-1",
          actorId: "admin-audit-user",
          actorIp: "192.168.1.100",
          userAgent: "Vitest/Admin",
          newValues: expect.objectContaining({
            slug: "audit-test-prog",
            name: "Audit Test Program",
            totalSlots: 300,
            status: "OPEN",
          }),
        }),
        select: { id: true },
      });
    });
  });

  describe("5. Program Update & Capacity Invariants", () => {
    const existingProgram = {
      id: "prog-update-1",
      slug: "update-prog",
      name: "Original Name",
      description: "Original Desc",
      totalSlots: 100,
      allocatedSlotsCount: 45,
      status: "OPEN",
      startsAt: new Date("2026-11-01T00:00:00.000Z"),
      endsAt: new Date("2026-11-10T00:00:00.000Z"),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it("rejects non-existent program ID with 404", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(null);

      await expect(
        updateWLProgram(mockPrisma, {
          programId: "non-existent",
          name: "New Name",
          adminUserId: "admin-1",
        }),
      ).rejects.toMatchObject({
        code: "PROGRAM_NOT_FOUND",
        status: 404,
      });
    });

    it("strictly prevents reducing totalSlots below current allocatedSlotsCount (capacity invariant)", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(existingProgram);

      // Program currently has 45 allocated slots. Trying to reduce capacity to 40 must fail!
      await expect(
        updateWLProgram(mockPrisma, {
          programId: "prog-update-1",
          totalSlots: 40,
          adminUserId: "admin-1",
        }),
      ).rejects.toMatchObject({
        code: "CAPACITY_EXCEEDED",
        status: 409,
      });
    });

    it("allows expanding capacity or setting totalSlots >= allocatedSlotsCount", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(existingProgram);
      mockPrisma.wLProgram.update.mockResolvedValueOnce({
        ...existingProgram,
        totalSlots: 150,
      });

      const res = await updateWLProgram(mockPrisma, {
        programId: "prog-update-1",
        totalSlots: 150,
        adminUserId: "admin-1",
      });

      expect(res.program.totalSlots).toBe(150);
      expect(mockPrisma.wLProgram.update).toHaveBeenCalledWith({
        where: { id: "prog-update-1" },
        data: expect.objectContaining({ totalSlots: 150 }),
      });
    });

    it("updates status with audit log recording old and new values", async () => {
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce(existingProgram);
      mockPrisma.wLProgram.update.mockResolvedValueOnce({
        ...existingProgram,
        status: "PAUSED",
      });

      await updateWLProgram(mockPrisma, {
        programId: "prog-update-1",
        status: "PAUSED",
        adminUserId: "admin-1",
      });

      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "WL_PROGRAM_UPDATED",
          entityType: "WLProgram",
          entityId: "prog-update-1",
          oldValues: expect.objectContaining({ status: "OPEN" }),
          newValues: expect.objectContaining({ status: "PAUSED" }),
        }),
        select: { id: true },
      });
    });
  });

  describe("6. List & Get WL Programs", () => {
    it("lists programs with campaign, slot, and queue counts", async () => {
      mockPrisma.wLProgram.findMany.mockResolvedValueOnce([
        {
          id: "prog-list-1",
          slug: "prog-1",
          name: "Program 1",
          description: null,
          totalSlots: 200,
          allocatedSlotsCount: 50,
          status: "OPEN",
          startsAt: new Date("2026-11-01T00:00:00.000Z"),
          endsAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          _count: {
            campaigns: 2,
            slots: 50,
            queueEntries: 15,
          },
        },
      ]);
      mockPrisma.wLProgram.count.mockResolvedValueOnce(1);

      const result = await listWLPrograms(mockPrisma);

      expect(result.total).toBe(1);
      expect(result.programs[0].campaignsCount).toBe(2);
      expect(result.programs[0].slotsCount).toBe(50);
      expect(result.programs[0].queueEntriesCount).toBe(15);
    });

    it("retrieves a single program by slug or ID", async () => {
      mockPrisma.wLProgram.findFirst.mockResolvedValueOnce({
        id: "prog-id-99",
        slug: "prog-slug-99",
        name: "Program 99",
        description: "Test description",
        totalSlots: 100,
        allocatedSlotsCount: 10,
        status: "UPCOMING",
        startsAt: new Date("2026-11-01T00:00:00.000Z"),
        endsAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        _count: { campaigns: 1, slots: 10, queueEntries: 0 },
      });

      const res = await getWLProgram(mockPrisma, "prog-slug-99");
      expect(res.id).toBe("prog-id-99");
      expect(res.name).toBe("Program 99");
    });
  });

  describe("7. Campaign Integration (Campaign Mandatory WL Program Relationship)", () => {
    it("allows creating a PromoCampaign linked to the created WLProgram", async () => {
      // 1. Mock WL Program exists
      mockPrisma.wLProgram.findUnique.mockResolvedValueOnce({ id: "valid-wl-prog-id" });
      mockPrisma.promoCampaign.findUnique.mockResolvedValueOnce(null);
      mockPrisma.promoCampaign.create.mockResolvedValueOnce({
        id: "camp-linked-1",
        slug: "genesis-campaign",
        title: "Genesis Campaign",
        description: null,
        wlProgramId: "valid-wl-prog-id",
        status: "DRAFT",
        createdAt: new Date(),
        updatedAt: new Date(),
        versions: [],
      });
      mockPrisma.campaignVersion.create.mockResolvedValueOnce({
        id: "cv-1",
        campaignId: "camp-linked-1",
        versionNumber: 1,
        isCurrent: true,
        compatibilityMode: "FRESH_START",
        startsAt: new Date("2026-11-01T00:00:00.000Z"),
        endsAt: null,
        changeNotes: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await createCampaign(mockPrisma, {
        slug: "genesis-campaign",
        title: "Genesis Campaign",
        wlProgramId: "valid-wl-prog-id",
        adminUserId: "admin-1",
        initialVersion: {
          startsAt: "2026-11-01T00:00:00.000Z",
        },
      });

      expect(res.campaign.wlProgramId).toBe("valid-wl-prog-id");
      expect(mockPrisma.promoCampaign.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            wlProgramId: "valid-wl-prog-id",
          }),
        }),
      );
    });
  });
});

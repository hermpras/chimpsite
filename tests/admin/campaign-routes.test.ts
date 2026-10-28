import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as LIST_GET, POST as CREATE_POST } from "@/app/api/admin/campaigns/route";
import {
  GET as DETAIL_GET,
  PUT as UPDATE_PUT,
} from "@/app/api/admin/campaigns/[id]/route";
import * as campaignService from "@/server/admin/campaign";
import { AdminCampaignError } from "@/server/admin/campaign";

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

import { requireAdminSession } from "@/server/auth/session";

describe("Campaign API Routes Testing", () => {
  const fakeAdminSession = {
    userId: "admin_test_user",
    address: "0x1111111111111111111111111111111111111111",
    role: "ADMIN" as const,
    adminRole: {
      id: "ar_1",
      userId: "admin_test_user",
      roleType: "ADMIN" as const,
      permissions: ["MANAGE_CAMPAIGNS"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue(fakeAdminSession as any);
  });

  // 1. GET /api/admin/campaigns
  describe("GET /api/admin/campaigns (Daftar Campaign)", () => {
    it("returns list of campaigns successfully", async () => {
      vi.spyOn(campaignService, "listCampaigns").mockResolvedValueOnce({
        campaigns: [
          {
            id: "camp-1",
            slug: "test-campaign",
            title: "Test Campaign",
            description: null,
            wlProgramId: "wl-1",
            status: "DRAFT",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            currentVersion: {
              id: "v-1",
              versionNumber: 1,
              isCurrent: true,
              compatibilityMode: "FRESH_START",
              startsAt: new Date().toISOString(),
              endsAt: null,
              changeNotes: null,
              createdAt: new Date().toISOString(),
            },
          },
        ],
        total: 1,
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns", {
        method: "GET",
      });
      const res = await LIST_GET(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.campaigns).toHaveLength(1);
      expect(data.campaigns[0].title).toBe("Test Campaign");
      expect(data.campaigns[0].status).toBe("DRAFT");
    });
  });

  // 2. POST /api/admin/campaigns
  describe("POST /api/admin/campaigns (Buat Campaign)", () => {
    it("creates a campaign with valid payload", async () => {
      vi.spyOn(campaignService, "createCampaign").mockResolvedValueOnce({
        success: true,
        campaign: {
          id: "camp-new",
          slug: "test-slug",
          title: "New Campaign",
          description: "Desc",
          wlProgramId: "wl-1",
          status: "DRAFT",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentVersion: null,
        },
        auditLogId: "audit-1",
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "test-slug",
          title: "New Campaign",
          description: "Desc",
          wlProgramId: "wl-1",
        }),
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.campaign.title).toBe("New Campaign");
    });
  });

  // 3. PUT /api/admin/campaigns/[id] (Perubahan Status)
  describe("PUT /api/admin/campaigns/[id] (Perubahan Status)", () => {
    it("successfully activates a campaign (DRAFT -> ACTIVE)", async () => {
      vi.spyOn(campaignService, "updateCampaign").mockResolvedValueOnce({
        success: true,
        campaign: {
          id: "camp-1",
          slug: "test-slug",
          title: "Campaign",
          description: null,
          wlProgramId: "wl-1",
          status: "ACTIVE",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentVersion: null,
        },
        auditLogId: "audit-2",
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });

      const res = await UPDATE_PUT(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.campaign.status).toBe("ACTIVE");
    });

    it("successfully pauses a campaign (ACTIVE -> PAUSED)", async () => {
      vi.spyOn(campaignService, "updateCampaign").mockResolvedValueOnce({
        success: true,
        campaign: {
          id: "camp-1",
          slug: "test-slug",
          title: "Campaign",
          description: null,
          wlProgramId: "wl-1",
          status: "PAUSED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentVersion: null,
        },
        auditLogId: "audit-3",
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "PAUSED" }),
      });

      const res = await UPDATE_PUT(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.campaign.status).toBe("PAUSED");
    });

    it("successfully ends/archives a campaign (ACTIVE -> ARCHIVED)", async () => {
      vi.spyOn(campaignService, "updateCampaign").mockResolvedValueOnce({
        success: true,
        campaign: {
          id: "camp-1",
          slug: "test-slug",
          title: "Campaign",
          description: null,
          wlProgramId: "wl-1",
          status: "ARCHIVED",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          currentVersion: null,
        },
        auditLogId: "audit-4",
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ARCHIVED" }),
      });

      const res = await UPDATE_PUT(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.campaign.status).toBe("ARCHIVED");
    });

    it("rejects transition when client requests status: 'ENDED' with 422 INVALID_STATUS", async () => {
      vi.spyOn(campaignService, "updateCampaign").mockRejectedValueOnce(
        new AdminCampaignError(
          "INVALID_STATUS",
          "status must be one of: DRAFT, ACTIVE, PAUSED, ARCHIVED.",
          422,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ENDED" }),
      });

      const res = await UPDATE_PUT(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(422);
      const data = await res.json();
      expect(data.error).toBe("INVALID_STATUS");
      expect(data.message).toContain(
        "status must be one of: DRAFT, ACTIVE, PAUSED, ARCHIVED.",
      );
    });
  });
});

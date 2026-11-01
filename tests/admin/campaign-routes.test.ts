import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as LIST_GET, POST as CREATE_POST } from "@/app/api/admin/campaigns/route";
import {
  GET as DETAIL_GET,
  PUT as UPDATE_PUT,
} from "@/app/api/admin/campaigns/[id]/route";
import {
  GET as VERSIONS_GET,
  POST as VERSIONS_POST,
} from "@/app/api/admin/campaigns/[id]/versions/route";
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

    it("returns 409 when campaign already exists for WL program", async () => {
      vi.spyOn(campaignService, "createCampaign").mockRejectedValueOnce(
        new AdminCampaignError(
          "CAMPAIGN_ALREADY_EXISTS",
          "A promo campaign already exists for this WL program. Only one main campaign is allowed.",
          409,
        ),
      );

      const req = new Request("http://localhost:3000/api/admin/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: "second-slug",
          title: "Second Campaign",
          wlProgramId: "wl-1",
        }),
      });

      const res = await CREATE_POST(req);
      expect(res.status).toBe(409);
      const data = await res.json();
      expect(data.error).toBe("CAMPAIGN_ALREADY_EXISTS");
      expect(data.message).toContain("Only one main campaign is allowed");
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

  // 4. GET /api/admin/campaigns/[id]/versions
  describe("GET /api/admin/campaigns/[id]/versions (Daftar Versi)", () => {
    it("returns list of versions successfully", async () => {
      vi.spyOn(campaignService, "listCampaignVersions").mockResolvedValueOnce({
        versions: [
          {
            id: "ver-2",
            campaignId: "camp-1",
            versionNumber: 2,
            isCurrent: true,
            compatibilityMode: "LEGACY_CARRIED",
            compatibleFromVersionId: "ver-1",
            startsAt: new Date().toISOString(),
            endsAt: null,
            changeNotes: "v2 launch",
            createdAt: new Date().toISOString(),
            taskCount: 3,
            tasks: [],
          },
        ],
        total: 1,
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1/versions", {
        method: "GET",
      });

      const res = await VERSIONS_GET(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.total).toBe(1);
      expect(data.versions[0].versionNumber).toBe(2);
      expect(data.versions[0].compatibilityMode).toBe("LEGACY_CARRIED");
    });

    it("returns 404 when campaign is not found", async () => {
      vi.spyOn(campaignService, "listCampaignVersions").mockRejectedValueOnce(
        new AdminCampaignError("CAMPAIGN_NOT_FOUND", "Campaign not found", 404),
      );

      const req = new Request("http://localhost:3000/api/admin/campaigns/non-existent/versions", {
        method: "GET",
      });

      const res = await VERSIONS_GET(req, { params: Promise.resolve({ id: "non-existent" }) });
      expect(res.status).toBe(404);
      const data = await res.json();
      expect(data.error).toBe("CAMPAIGN_NOT_FOUND");
    });
  });

  // 5. POST /api/admin/campaigns/[id]/versions
  describe("POST /api/admin/campaigns/[id]/versions (Buat Versi Baru)", () => {
    it("creates and publishes a new campaign version", async () => {
      vi.spyOn(campaignService, "createCampaignVersion").mockResolvedValueOnce({
        success: true,
        version: {
          id: "ver-2",
          campaignId: "camp-1",
          versionNumber: 2,
          isCurrent: true,
          compatibilityMode: "LEGACY_CARRIED",
          compatibleFromVersionId: "ver-1",
          startsAt: new Date().toISOString(),
          endsAt: null,
          changeNotes: "Updated tweet url",
          createdAt: new Date().toISOString(),
          taskCount: 2,
          tasks: [],
        },
        auditLogId: "audit-version-2",
      });

      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          changeNotes: "Updated tweet url",
          taskUpdates: [
            {
              taskCode: "REPOST_ANNOUNCEMENT",
              requirementMetadata: { tweetUrl: "https://x.com/ChimpHood/status/999" },
            },
          ],
        }),
      });

      const res = await VERSIONS_POST(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(201);
      const data = await res.json();
      expect(data.success).toBe(true);
      expect(data.version.versionNumber).toBe(2);
      expect(data.version.compatibilityMode).toBe("LEGACY_CARRIED");
    });

    it("rejects invalid input body with 400 MALFORMED_JSON", async () => {
      const req = new Request("http://localhost:3000/api/admin/campaigns/camp-1/versions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{not-valid-json",
      });

      const res = await VERSIONS_POST(req, { params: Promise.resolve({ id: "camp-1" }) });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe("MALFORMED_JSON");
    });
  });
});

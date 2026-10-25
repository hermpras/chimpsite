import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  GET,
  POST,
  PUT,
  DELETE,
  PATCH,
  HEAD,
  OPTIONS,
} from "@/app/api/admin/whitelist/export/route";

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

vi.mock("@/server/admin/opensea-export", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/admin/opensea-export")>();
  return {
    ...actual,
    exportOpenSeaAllowlist: vi.fn(),
  };
});

import { requireAdminSession, AdminAuthError } from "@/server/auth/session";
import { exportOpenSeaAllowlist, OpenSeaExportError } from "@/server/admin/opensea-export";

describe("Admin Whitelist OpenSea Export API Route (GET /api/admin/whitelist/export)", () => {
  const validAdminSession = {
    sessionId: "sess_admin_1",
    userId: "admin_user_1",
    address: "0xadmin1",
    adminRole: {
      id: "role_1",
      userId: "admin_user_1",
      roleType: "SUPER_ADMIN",
      permissions: ["MANAGE_WL"],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requireAdminSession).mockResolvedValue(validAdminSession as any);
  });

  describe("Authentication & Authorization", () => {
    it("returns 401 when request is unauthenticated", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("UNAUTHORIZED", "Authentication required.", 401),
      );

      const req = new Request("http://localhost/api/admin/whitelist/export?type=gtd");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(401);
      expect(json.error).toBe("UNAUTHORIZED");
    });

    it("returns 403 when user is not an admin or lacks MANAGE_WL", async () => {
      vi.mocked(requireAdminSession).mockRejectedValueOnce(
        new AdminAuthError("FORBIDDEN", "Forbidden resource.", 403),
      );

      const req = new Request("http://localhost/api/admin/whitelist/export?type=gtd");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(403);
      expect(json.error).toBe("FORBIDDEN");
    });
  });

  describe("Query Parameter Validation", () => {
    it("returns 400 when type or stage parameter is missing", async () => {
      const req = new Request("http://localhost/api/admin/whitelist/export");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("MISSING_EXPORT_STAGE");
    });

    it("returns 400 when type parameter is invalid", async () => {
      vi.mocked(exportOpenSeaAllowlist).mockRejectedValueOnce(
        new OpenSeaExportError(
          "INVALID_EXPORT_STAGE",
          "Export stage must be either 'gtd' or 'fcfs'.",
          400,
        ),
      );

      const req = new Request("http://localhost/api/admin/whitelist/export?type=invalid");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toBe("INVALID_EXPORT_STAGE");
    });
  });

  describe("Program State & Freeze Verification", () => {
    it("returns 409 when the whitelist program is still active / not finalized", async () => {
      vi.mocked(exportOpenSeaAllowlist).mockRejectedValueOnce(
        new OpenSeaExportError(
          "PROGRAM_NOT_FINALIZED",
          "Program has not been finalized or closed.",
          409,
        ),
      );

      const req = new Request("http://localhost/api/admin/whitelist/export?type=gtd");
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(409);
      expect(json.error).toBe("PROGRAM_NOT_FINALIZED");
    });

    it("returns 404 when the specified whitelist program does not exist", async () => {
      vi.mocked(exportOpenSeaAllowlist).mockRejectedValueOnce(
        new OpenSeaExportError("PROGRAM_NOT_FOUND", "Program not found.", 404),
      );

      const req = new Request(
        "http://localhost/api/admin/whitelist/export?type=gtd&programId=unknown",
      );
      const res = await GET(req);
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toBe("PROGRAM_NOT_FOUND");
    });
  });

  describe("Successful CSV Exports", () => {
    it("successfully downloads chimphood-gtd-allowlist.csv for GTD", async () => {
      const sampleCsv = "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed,1\n";
      vi.mocked(exportOpenSeaAllowlist).mockResolvedValueOnce({
        filename: "chimphood-gtd-allowlist.csv",
        csv: sampleCsv,
        count: 1,
        stage: "gtd",
        program: {
          id: "p1",
          slug: "chimphood-wl-main",
          name: "Main Program",
          status: "FINALIZED" as any,
        },
      });

      const req = new Request("http://localhost/api/admin/whitelist/export?type=gtd");
      const res = await GET(req);
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toBe(
        'attachment; filename="chimphood-gtd-allowlist.csv"',
      );
      expect(body).toBe(sampleCsv);
      expect(exportOpenSeaAllowlist).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "gtd",
        }),
      );
    });

    it("successfully downloads chimphood-fcfs-allowlist.csv for FCFS", async () => {
      const sampleCsv = "0x71c89f074d310ec5e427773cb20a44ef69d7a229,1\n";
      vi.mocked(exportOpenSeaAllowlist).mockResolvedValueOnce({
        filename: "chimphood-fcfs-allowlist.csv",
        csv: sampleCsv,
        count: 1,
        stage: "fcfs",
        program: {
          id: "p1",
          slug: "chimphood-wl-main",
          name: "Main Program",
          status: "FINALIZED" as any,
        },
      });

      const req = new Request(
        "http://localhost/api/admin/whitelist/export?stage=fcfs&slug=custom-slug",
      );
      const res = await GET(req);
      const body = await res.text();

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/csv; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toBe(
        'attachment; filename="chimphood-fcfs-allowlist.csv"',
      );
      expect(body).toBe(sampleCsv);
      expect(exportOpenSeaAllowlist).toHaveBeenCalledWith(
        expect.objectContaining({
          stage: "fcfs",
          programIdOrSlug: "custom-slug",
        }),
      );
    });
  });

  describe("HTTP Method Not Allowed", () => {
    it("rejects non-GET HTTP methods with 405 Method Not Allowed", async () => {
      const methods = [POST, PUT, DELETE, PATCH, HEAD, OPTIONS];
      for (const handler of methods) {
        const res = handler();
        expect(res.status).toBe(405);
        expect(res.headers.get("Allow")).toBe("GET");
      }
    });
  });
});

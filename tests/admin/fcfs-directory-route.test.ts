import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET } from "@/app/api/admin/whitelist/directory/route";
import * as sessionModule from "@/server/auth/session";
import * as directoryService from "@/server/admin/fcfs-directory";

describe("GET /api/admin/whitelist/directory Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when user is not authenticated", async () => {
    vi.spyOn(sessionModule, "requireAdminSession").mockRejectedValue(
      new sessionModule.AdminAuthError("UNAUTHORIZED", "Not signed in", 401),
    );

    const req = new Request("http://localhost:3000/api/admin/whitelist/directory");
    const res = await GET(req);

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe("UNAUTHORIZED");
  });

  it("returns 403 when user lacks MODERATOR/ADMIN role", async () => {
    vi.spyOn(sessionModule, "requireAdminSession").mockRejectedValue(
      new sessionModule.AdminAuthError("FORBIDDEN", "Moderator role required", 403),
    );

    const req = new Request("http://localhost:3000/api/admin/whitelist/directory");
    const res = await GET(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe("FORBIDDEN");
  });

  it("returns 200 with directory entries for authorized callers", async () => {
    vi.spyOn(sessionModule, "requireAdminSession").mockResolvedValue({
      user: { id: "admin-1" },
      adminRole: { roleType: "ADMIN" },
    } as any);

    vi.spyOn(directoryService, "listFcfsDirectory").mockResolvedValue({
      entries: [
        {
          id: "entry-1",
          userId: "user-1",
          programId: "prog-genesis",
          queueNumber: 1,
          joinedAt: new Date(),
          status: "WAITING",
          user: {
            id: "user-1",
            walletAddress: "0x1111111111111111111111111111111111111111",
            xIdentity: {
              xId: "x-1",
              username: "chimp_test",
              name: "Chimp Test",
              profileImageUrl: null,
            },
            isBanned: false,
          },
          qualification: {
            isFullyQualified: true,
            heldCategories: ["BG", "FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"],
            heldCategoriesCount: 5,
            missingCategories: [],
            tasksCompleted: true,
            completedTasksCount: 1,
            totalTasksCount: 1,
            isBanned: false,
            missingRequirements: [],
          },
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
      program: {
        id: "prog-genesis",
        name: "ChimpHood Genesis",
        slug: "genesis",
        status: "OPEN",
        totalSlots: 500,
        allocatedSlotsCount: 450,
        vacantCount: 50,
      },
    });

    const req = new Request(
      "http://localhost:3000/api/admin/whitelist/directory?search=0x111&qualifiedOnly=true&limit=10&offset=0",
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.entries).toHaveLength(1);
    expect(json.total).toBe(1);
    expect(json.program.vacantCount).toBe(50);
  });
});

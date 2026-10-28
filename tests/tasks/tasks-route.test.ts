import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET, POST, PUT, DELETE, PATCH, OPTIONS } from "@/app/api/tasks/route";

vi.mock("@/server/auth/session", () => ({
  authenticateRequest: vi.fn(),
}));

vi.mock("@/server/db", () => ({
  prisma: {
    wLProgram: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    promoCampaign: {
      findMany: vi.fn(),
    },
    taskProgress: {
      findMany: vi.fn(),
    },
  },
}));

import { authenticateRequest } from "@/server/auth/session";
import { prisma } from "@/server/db";

describe("Active Tasks API route (app/api/tasks/route.ts)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns configured: false when no program is active", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.wLProgram.findFirst).mockResolvedValueOnce(null);

    const req = new Request("http://localhost:3000/api/tasks");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(false);
    expect(body.campaigns).toEqual([]);
  });

  it("returns campaigns and tasks without user progress when unauthenticated", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "prog_1",
      slug: "chimphood-wl-main",
      name: "Main Whitelist",
      status: "OPEN",
    } as any);

    vi.mocked(authenticateRequest).mockResolvedValueOnce(null);

    vi.mocked(prisma.promoCampaign.findMany).mockResolvedValueOnce([
      {
        id: "camp_1",
        slug: "early-bird",
        title: "Early Bird Quest",
        description: "Join early",
        status: "ACTIVE",
        wlProgramId: "prog_1",
        versions: [
          {
            id: "ver_1",
            versionNumber: 1,
            startsAt: new Date("2026-10-20T00:00:00Z"),
            endsAt: null,
            tasks: [
              {
                id: "task_1",
                versionId: "ver_1",
                taskCode: "X_FOLLOW",
                title: "Follow X",
                description: "Follow @ChimpHood",
                taskType: "URL",
                points: 20,
                isRequired: true,
                sortOrder: 1,
                requirementMetadata: null,
              },
            ],
          },
        ],
      } as any,
    ]);

    const req = new Request("http://localhost:3000/api/tasks");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.campaigns).toHaveLength(1);
    expect(body.campaigns[0].tasks).toHaveLength(1);
    expect(body.campaigns[0].tasks[0].id).toBe("task_1");
    expect(body.campaigns[0].tasks[0].isRequired).toBe(true);
    expect(body.campaigns[0].tasks[0].progress).toBeNull();
    expect(body.campaigns[0].tasks[0].latestSubmission).toBeNull();
  });

  it("returns user progress and latest submission when authenticated", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockResolvedValueOnce({
      id: "prog_1",
      slug: "chimphood-wl-main",
      name: "Main Whitelist",
      status: "OPEN",
    } as any);

    vi.mocked(authenticateRequest).mockResolvedValueOnce({
      sessionId: "sess_1",
      userId: "user_1",
      address: "0x123",
    } as any);

    vi.mocked(prisma.promoCampaign.findMany).mockResolvedValueOnce([
      {
        id: "camp_1",
        slug: "early-bird",
        title: "Early Bird Quest",
        description: "Join early",
        status: "ACTIVE",
        wlProgramId: "prog_1",
        versions: [
          {
            id: "ver_1",
            versionNumber: 1,
            startsAt: new Date("2026-10-20T00:00:00Z"),
            endsAt: null,
            tasks: [
              {
                id: "task_1",
                versionId: "ver_1",
                taskCode: "X_FOLLOW",
                title: "Follow X",
                description: "Follow @ChimpHood",
                taskType: "URL",
                points: 20,
                isRequired: true,
                sortOrder: 1,
                requirementMetadata: null,
              },
            ],
          },
        ],
      } as any,
    ]);

    vi.mocked(prisma.taskProgress.findMany).mockResolvedValueOnce([
      {
        id: "tp_1",
        userId: "user_1",
        taskId: "task_1",
        status: "SUBMITTED",
        verifiedAt: null,
        completedAt: null,
        evidenceSubmissions: [
          {
            id: "ev_1",
            submissionType: "URL",
            payload: "https://x.com/post/1",
            status: "PENDING_REVIEW",
            reviewerNotes: null,
            reviewedAt: null,
            createdAt: new Date("2026-10-24T12:00:00Z"),
          },
        ],
      } as any,
    ]);

    const req = new Request("http://localhost:3000/api/tasks");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.campaigns[0].tasks[0].progress.status).toBe("SUBMITTED");
    expect(body.campaigns[0].tasks[0].latestSubmission.status).toBe("PENDING_REVIEW");
    expect(body.campaigns[0].tasks[0].latestSubmission.payload).toBe(
      "https://x.com/post/1",
    );
  });

  it("handles server errors gracefully", async () => {
    vi.mocked(prisma.wLProgram.findUnique).mockRejectedValueOnce(
      new Error("Database offline"),
    );
    const req = new Request("http://localhost:3000/api/tasks");
    const res = await GET(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("SERVER_ERROR");
  });

  it("returns 405 for non-GET methods and 204 for OPTIONS", async () => {
    expect((await POST()).status).toBe(405);
    expect((await PUT()).status).toBe(405);
    expect((await DELETE()).status).toBe(405);
    expect((await PATCH()).status).toBe(405);
    expect((await OPTIONS()).status).toBe(204);
  });
});

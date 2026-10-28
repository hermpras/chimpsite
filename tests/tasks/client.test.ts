import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  submitTaskEvidence,
  getTaskEvidence,
  fetchActiveTasks,
} from "@/lib/tasks/client";

describe("Task Evidence Client (lib/tasks/client.ts)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("submitTaskEvidence()", () => {
    it("calls POST /api/tasks/[id]/evidence with JSON payload and returns response", async () => {
      const mockResponse = {
        success: true,
        submission: { id: "ev_1", status: "PENDING_REVIEW" },
        taskProgress: { status: "SUBMITTED" },
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await submitTaskEvidence("task_123", {
        submissionType: "URL",
        payload: "https://x.com/post/1",
      });

      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks/task_123/evidence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          submissionType: "URL",
          payload: "https://x.com/post/1",
        }),
      });
      expect(result).toEqual(mockResponse);
    });

    it("throws error with server message on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "TASK_ALREADY_COMPLETED",
          message: "Task is already completed.",
        }),
      } as Response);

      await expect(
        submitTaskEvidence("task_123", {
          payload: "https://x.com/post/1",
        }),
      ).rejects.toThrow("Task is already completed.");
    });
  });

  describe("getTaskEvidence()", () => {
    it("calls GET /api/tasks/[id]/evidence without query params by default", async () => {
      const mockResponse = {
        task: { id: "task_123" },
        submissions: [],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await getTaskEvidence("task_123");

      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks/task_123/evidence", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      expect(result).toEqual(mockResponse);
    });

    it("appends ?userId= when userId option is passed", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ task: { id: "task_123" } }),
      } as Response);

      await getTaskEvidence("task_123", { userId: "user_456" });

      expect(fetchSpy).toHaveBeenCalledWith(
        "/api/tasks/task_123/evidence?userId=user_456",
        {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        },
      );
    });

    it("throws error on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "FORBIDDEN",
          message: "Not authorized",
        }),
      } as Response);

      await expect(getTaskEvidence("task_123", { userId: "other" })).rejects.toThrow(
        "Not authorized",
      );
    });
  });

  describe("fetchActiveTasks()", () => {
    it("calls GET /api/tasks without query params by default", async () => {
      const mockResponse = {
        configured: true,
        campaigns: [
          {
            id: "c1",
            slug: "early-bird",
            title: "Early Bird",
            status: "ACTIVE",
            tasks: [
              {
                id: "t1",
                taskCode: "T1",
                title: "Follow X",
                isRequired: true,
              },
            ],
          },
        ],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchActiveTasks();

      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      expect(result).toEqual(mockResponse);
    });

    it("appends ?programSlug= when programSlug option is passed", async () => {
      const mockResponse = {
        configured: true,
        campaigns: [],
      };

      const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      } as Response);

      const result = await fetchActiveTasks("custom-slug");

      expect(fetchSpy).toHaveBeenCalledWith("/api/tasks?programSlug=custom-slug", {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      });
      expect(result).toEqual(mockResponse);
    });

    it("throws error on non-ok response", async () => {
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          error: "SERVER_ERROR",
          message: "Internal server error",
        }),
      } as Response);

      await expect(fetchActiveTasks()).rejects.toThrow("Internal server error");
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  pushRecentDropPull,
  getRecentDropPullsFromRedis,
  seedRecentDropPullsToRedis,
  getRecentPullsKey,
  __clearTestRecentPulls,
  __setTestRecentPullsRedis,
  type RecentDropPull,
} from "@/lib/redis/recent-pulls";

describe("lib/redis/recent-pulls (Upstash Redis List Cache for Drops)", () => {
  beforeEach(() => {
    __clearTestRecentPulls();
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  const samplePull1: RecentDropPull = {
    id: "claim-1",
    traitName: "Cyber Visor",
    category: "EYES",
    rarity: "RARE",
    edition: 1,
    imageUrl: "https://elychimp.io/traits/cyber-visor.png",
    claimedBy: "@master_chimp",
    periodIndex: 1,
    claimedAt: "2026-11-18T01:00:00.000Z",
  };

  const samplePull2: RecentDropPull = {
    id: "claim-2",
    traitName: "Golden Fur",
    category: "FUR",
    rarity: "LEGENDARY",
    edition: 5,
    imageUrl: undefined,
    claimedBy: "0x1234...5678",
    periodIndex: 1,
    claimedAt: "2026-11-18T01:05:00.000Z",
  };

  it("generates correct Redis key with drops:recent_pulls namespace prefix", () => {
    expect(getRecentPullsKey("drop-abc")).toBe("drops:recent_pulls:drop-abc");
  });

  describe("In-Memory Mode (Local Dev & Test Fallback)", () => {
    it("pushes pulls and retrieves them in LIFO order (newest first)", async () => {
      await pushRecentDropPull("drop-1", samplePull1);
      await pushRecentDropPull("drop-1", samplePull2);

      const pulls = await getRecentDropPullsFromRedis("drop-1", 8);
      expect(pulls).toBeDefined();
      expect(pulls).toHaveLength(2);
      expect(pulls![0]).toEqual(samplePull2);
      expect(pulls![1]).toEqual(samplePull1);
    });

    it("respects the custom limit parameter", async () => {
      await pushRecentDropPull("drop-1", samplePull1);
      await pushRecentDropPull("drop-1", samplePull2);

      const pulls = await getRecentDropPullsFromRedis("drop-1", 1);
      expect(pulls).toHaveLength(1);
      expect(pulls![0]).toEqual(samplePull2);
    });

    it("caps in-memory list at MAX_RECENT_PULLS (20)", async () => {
      for (let i = 1; i <= 25; i++) {
        await pushRecentDropPull("drop-1", {
          ...samplePull1,
          id: `claim-${i}`,
          edition: i,
        });
      }

      const pulls = await getRecentDropPullsFromRedis("drop-1", 50);
      expect(pulls).toHaveLength(20);
      expect(pulls![0].id).toBe("claim-25");
      expect(pulls![19].id).toBe("claim-6");
    });

    it("returns null when no pulls exist for a drop", async () => {
      const pulls = await getRecentDropPullsFromRedis("drop-empty", 8);
      expect(pulls).toBeNull();
    });

    it("seeds recent pulls from PostgreSQL array and retrieves them", async () => {
      const result = await seedRecentDropPullsToRedis("drop-seed", [
        samplePull1,
        samplePull2,
      ]);
      expect(result).toBe(true);

      const pulls = await getRecentDropPullsFromRedis("drop-seed", 8);
      expect(pulls).toEqual([samplePull1, samplePull2]);
    });

    it("seedRecentDropPullsToRedis returns false for empty or null array", async () => {
      expect(await seedRecentDropPullsToRedis("drop-seed", [])).toBe(false);
      expect(await seedRecentDropPullsToRedis("drop-seed", null as any)).toBe(false);
    });
  });

  describe("Upstash Redis Mode (Mocked Upstash Client)", () => {
    it("calls redis.lpush and redis.ltrim on pushRecentDropPull", async () => {
      const mockLpush = vi.fn().mockResolvedValue(1);
      const mockLtrim = vi.fn().mockResolvedValue("OK");
      __setTestRecentPullsRedis({
        lpush: mockLpush,
        ltrim: mockLtrim,
      } as any);

      const success = await pushRecentDropPull("drop-redis", samplePull1);
      expect(success).toBe(true);
      expect(mockLpush).toHaveBeenCalledWith(
        "drops:recent_pulls:drop-redis",
        JSON.stringify(samplePull1),
      );
      expect(mockLtrim).toHaveBeenCalledWith(
        "drops:recent_pulls:drop-redis",
        0,
        19,
      );
    });

    it("handles Redis push errors gracefully and returns false", async () => {
      const mockLpush = vi.fn().mockRejectedValue(new Error("Upstash REST connection timeout"));
      __setTestRecentPullsRedis({
        lpush: mockLpush,
        ltrim: vi.fn(),
      } as any);

      const success = await pushRecentDropPull("drop-redis", samplePull1);
      expect(success).toBe(false);
    });

    it("reads and parses items with redis.lrange on getRecentDropPullsFromRedis", async () => {
      const mockLrange = vi.fn().mockResolvedValue([
        JSON.stringify(samplePull2),
        JSON.stringify(samplePull1),
      ]);
      __setTestRecentPullsRedis({
        lrange: mockLrange,
      } as any);

      const pulls = await getRecentDropPullsFromRedis("drop-redis", 8);
      expect(pulls).toEqual([samplePull2, samplePull1]);
      expect(mockLrange).toHaveBeenCalledWith(
        "drops:recent_pulls:drop-redis",
        0,
        7,
      );
    });

    it("returns null when redis.lrange returns empty array or null", async () => {
      const mockLrange = vi.fn().mockResolvedValue([]);
      __setTestRecentPullsRedis({
        lrange: mockLrange,
      } as any);

      const pulls = await getRecentDropPullsFromRedis("drop-redis", 8);
      expect(pulls).toBeNull();
    });

    it("safely filters out corrupted JSON or invalid objects in redis.lrange response", async () => {
      const mockLrange = vi.fn().mockResolvedValue([
        JSON.stringify(samplePull1),
        "invalid-non-json-string",
        JSON.stringify({ notAValidPull: true }),
        JSON.stringify(samplePull2),
      ]);
      __setTestRecentPullsRedis({
        lrange: mockLrange,
      } as any);

      const pulls = await getRecentDropPullsFromRedis("drop-redis", 8);
      expect(pulls).toEqual([samplePull1, samplePull2]);
    });

    it("handles Redis read errors gracefully and returns null", async () => {
      const mockLrange = vi.fn().mockRejectedValue(new Error("Upstash server 500 error"));
      __setTestRecentPullsRedis({
        lrange: mockLrange,
      } as any);

      const pulls = await getRecentDropPullsFromRedis("drop-redis", 8);
      expect(pulls).toBeNull();
    });

    it("seeds Redis with del, lpush (oldest to newest), and ltrim", async () => {
      const mockDel = vi.fn().mockResolvedValue(1);
      const mockLpush = vi.fn().mockResolvedValue(2);
      const mockLtrim = vi.fn().mockResolvedValue("OK");
      __setTestRecentPullsRedis({
        del: mockDel,
        lpush: mockLpush,
        ltrim: mockLtrim,
      } as any);

      const success = await seedRecentDropPullsToRedis("drop-redis", [
        samplePull1,
        samplePull2,
      ]);
      expect(success).toBe(true);
      expect(mockDel).toHaveBeenCalledWith("drops:recent_pulls:drop-redis");
      // Oldest pushed first so newest remains at index 0
      expect(mockLpush).toHaveBeenCalledWith(
        "drops:recent_pulls:drop-redis",
        JSON.stringify(samplePull2),
        JSON.stringify(samplePull1),
      );
      expect(mockLtrim).toHaveBeenCalledWith(
        "drops:recent_pulls:drop-redis",
        0,
        19,
      );
    });
  });
});

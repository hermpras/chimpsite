// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { isValidClientIp } from "@/lib/auth/rate-limit";
import {
  getDeterministicRfc5737Ip,
  isLocalhostUrl,
  hasFlag,
  getArg,
  buildRequestHeaders,
} from "./autocannon-whitelist-qualify.mjs";
import { verifyWhitelistInvariants } from "./verify-whitelist-invariants";

describe("Whitelist Load Test Runner & Invariant Guard Tests", () => {
  describe("1. Safety Guards (isLocalhostUrl)", () => {
    it("permits standard localhost URLs", () => {
      expect(isLocalhostUrl("http://localhost:3000")).toBe(true);
      expect(isLocalhostUrl("http://127.0.0.1:3000")).toBe(true);
      expect(isLocalhostUrl("http://[::1]:3000")).toBe(true);
      expect(isLocalhostUrl("http://localhost")).toBe(true);
    });

    it("strictly forbids external, Supabase, staging, or production URLs", () => {
      expect(isLocalhostUrl("https://chimphood.com")).toBe(false);
      expect(isLocalhostUrl("https://aws-0-ap-northeast-2.pooler.supabase.com")).toBe(false);
      expect(isLocalhostUrl("https://staging.chimphood.com")).toBe(false);
      expect(isLocalhostUrl("http://192.168.1.100:3000")).toBe(false);
      expect(isLocalhostUrl("")).toBe(false);
      expect(isLocalhostUrl("invalid-url")).toBe(false);
    });
  });

  describe("2. RFC 5737 IP Allocation", () => {
    it("allocates valid documentation IPs without collision", () => {
      const ips = new Set<string>();
      for (let i = 0; i < 100; i++) {
        const ip = getDeterministicRfc5737Ip(i);
        expect(isValidClientIp(ip)).toBe(true);
        expect(ip.startsWith("198.51.100.")).toBe(true);
        ips.add(ip);
      }
      expect(ips.size).toBe(100);
    });

    it("overflows cleanly into TEST-NET-3 for large worker counts", () => {
      const overflowIp = getDeterministicRfc5737Ip(250);
      expect(overflowIp).toBe("203.0.113.1");
      expect(isValidClientIp(overflowIp)).toBe(true);
    });
  });

  describe("3. Header Construction & CLI Parsing", () => {
    it("creates standard headers without IP spoofing by default", () => {
      const headers = buildRequestHeaders({
        workerId: 5,
        sessionIndex: 5,
        cookie: "chimphood_session=dummy_secret_cookie",
        payloadLength: 42,
        simulateIps: false,
      }) as Record<string, string>;

      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Content-Length"]).toBe(42);
      expect(headers["Cookie"]).toBe("chimphood_session=dummy_secret_cookie");
      expect(headers["User-Agent"]).toBe("ChimpHood-WhitelistLoadWorker/5");
      expect(headers["X-Forwarded-For"]).toBeUndefined();
    });

    it("injects deterministic IP only when simulateIps is true", () => {
      const headers = buildRequestHeaders({
        workerId: 12,
        sessionIndex: 12,
        cookie: "chimphood_session=dummy_cookie",
        payloadLength: 50,
        simulateIps: true,
      }) as Record<string, string>;

      expect(headers["X-Forwarded-For"]).toBe("198.51.100.13");
    });

    it("parses CLI flags and arguments accurately", () => {
      const args = ["--connections", "50", "--scenario=duplicate", "--simulate-ips"];
      expect(hasFlag(args, "simulate-ips")).toBe(true);
      expect(hasFlag(args, "unknown")).toBe(false);
      expect(getArg(args, "connections", "10")).toBe("50");
      expect(getArg(args, "scenario", "multi-user")).toBe("duplicate");
      expect(getArg(args, "missing", "default-val")).toBe("default-val");
    });
  });

  describe("4. Whitelist Invariants Verifier Unit Tests", () => {
    it("passes when all capacity, unique user, and slot invariants hold", async () => {
      const mockPrisma: any = {
        wLProgram: {
          findUnique: vi.fn().mockResolvedValue({
            id: "prog-1",
            name: "Test Prog",
            totalSlots: 20,
            allocatedSlotsCount: 5,
          }),
        },
        wLSlot: {
          count: vi.fn().mockResolvedValue(5),
          findMany: vi.fn().mockResolvedValue([]),
        },
        wLQueueEntry: {
          count: vi.fn().mockResolvedValue(0),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };

      const result = await verifyWhitelistInvariants(mockPrisma, "prog-1");
      expect(result.passed).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("fails when active slots mismatch allocatedSlotsCount", async () => {
      const mockPrisma: any = {
        wLProgram: {
          findUnique: vi.fn().mockResolvedValue({
            id: "prog-1",
            name: "Test Prog",
            totalSlots: 20,
            allocatedSlotsCount: 5,
          }),
        },
        wLSlot: {
          count: vi.fn().mockResolvedValue(3), // Mismatch! 3 active slots vs counter 5
          findMany: vi.fn().mockResolvedValue([]),
        },
        wLQueueEntry: {
          count: vi.fn().mockResolvedValue(0),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };

      const result = await verifyWhitelistInvariants(mockPrisma, "prog-1");
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("does not match"))).toBe(true);
    });

    it("fails when allocatedSlotsCount exceeds totalSlots", async () => {
      const mockPrisma: any = {
        wLProgram: {
          findUnique: vi.fn().mockResolvedValue({
            id: "prog-1",
            name: "Test Prog",
            totalSlots: 10,
            allocatedSlotsCount: 12, // Over-allocation!
          }),
        },
        wLSlot: {
          count: vi.fn().mockResolvedValue(12),
          findMany: vi.fn().mockResolvedValue([]),
        },
        wLQueueEntry: {
          count: vi.fn().mockResolvedValue(0),
        },
        $queryRaw: vi.fn().mockResolvedValue([]),
      };

      const result = await verifyWhitelistInvariants(mockPrisma, "prog-1");
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("exceeds totalSlots"))).toBe(true);
    });

    it("fails when duplicate slots per user are detected", async () => {
      const mockPrisma: any = {
        wLProgram: {
          findUnique: vi.fn().mockResolvedValue({
            id: "prog-1",
            name: "Test Prog",
            totalSlots: 20,
            allocatedSlotsCount: 2,
          }),
        },
        wLSlot: {
          count: vi.fn().mockResolvedValue(2),
          findMany: vi.fn().mockResolvedValue([]),
        },
        wLQueueEntry: {
          count: vi.fn().mockResolvedValue(0),
        },
        $queryRaw: vi.fn().mockImplementation(async (strings: TemplateStringsArray) => {
          const sql = strings.join("?");
          if (sql.includes('SELECT "userId", COUNT(*) as count')) {
            return [{ userId: "usr-duplicate", count: 2n }];
          }
          return [];
        }),
      };

      const result = await verifyWhitelistInvariants(mockPrisma, "prog-1");
      expect(result.passed).toBe(false);
      expect(result.violations.some((v) => v.includes("duplicate GTD slots"))).toBe(true);
    });
  });
});

// @vitest-environment node
import { describe, it, expect } from "vitest";
import { isValidClientIp } from "@/lib/auth/rate-limit";
import {
  getDeterministicRfc5737Ip,
  isLocalhostUrl,
  hasFlag,
  buildRequestHeaders,
} from "./autocannon-drops-claim.mjs";

describe("Load Test Runner: Multi-IP Simulation & Safety Guards", () => {
  describe("1. Localhost Safety Guard (isLocalhostUrl)", () => {
    it("allows standard local dev URLs", () => {
      expect(isLocalhostUrl("http://localhost:3000")).toBe(true);
      expect(isLocalhostUrl("http://127.0.0.1:3000")).toBe(true);
      expect(isLocalhostUrl("http://127.0.0.1:8080")).toBe(true);
      expect(isLocalhostUrl("http://[::1]:3000")).toBe(true);
      expect(isLocalhostUrl("http://localhost")).toBe(true);
    });

    it("strictly rejects external, staging, Supabase, or production URLs", () => {
      expect(isLocalhostUrl("https://chimphood.com")).toBe(false);
      expect(isLocalhostUrl("https://aws-0-ap-northeast-2.pooler.supabase.com")).toBe(
        false,
      );
      expect(isLocalhostUrl("https://staging.chimphood.com")).toBe(false);
      expect(isLocalhostUrl("http://192.168.1.150:3000")).toBe(false);
      expect(isLocalhostUrl("http://10.0.0.1:3000")).toBe(false);
      expect(isLocalhostUrl("not-a-valid-url")).toBe(false);
      expect(isLocalhostUrl("")).toBe(false);
    });
  });

  describe("2. RFC 5737 Deterministic IP Allocation", () => {
    it("maps 100 sessions to 100 distinct valid RFC 5737 documentation IPs", () => {
      const generatedIps = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const ip = getDeterministicRfc5737Ip(i);

        // Must be recognized as valid by the app's own client IP validator
        expect(isValidClientIp(ip)).toBe(true);

        // Must fall within RFC 5737 TEST-NET-2 (198.51.100.0/24)
        expect(ip.startsWith("198.51.100.")).toBe(true);

        generatedIps.add(ip);
      }

      // Exactly 100 distinct IPs without collision
      expect(generatedIps.size).toBe(100);
    });

    it("is completely deterministic per session index", () => {
      expect(getDeterministicRfc5737Ip(0)).toBe("198.51.100.1");
      expect(getDeterministicRfc5737Ip(1)).toBe("198.51.100.2");
      expect(getDeterministicRfc5737Ip(99)).toBe("198.51.100.100");

      // Repeated invocations yield identical IPs
      expect(getDeterministicRfc5737Ip(42)).toBe(getDeterministicRfc5737Ip(42));
      expect(getDeterministicRfc5737Ip(42)).toBe("198.51.100.43");
    });

    it("handles large session pools by utilizing RFC 5737 TEST-NET-3", () => {
      // 250 -> 203.0.113.1 (TEST-NET-3)
      const overflowIp = getDeterministicRfc5737Ip(250);
      expect(overflowIp).toBe("203.0.113.1");
      expect(isValidClientIp(overflowIp)).toBe(true);
    });
  });

  describe("3. Request Headers Construction & Default Behavior", () => {
    const dummyCookie = "chimphood_session=dummy_cookie_payload";

    it("leaves X-Forwarded-For completely absent when simulateIps is false (default)", () => {
      const headers = buildRequestHeaders({
        workerId: 3,
        sessionIndex: 3,
        cookie: dummyCookie,
        payloadLength: 128,
        simulateIps: false,
      }) as Record<string, any>;

      expect(headers["X-Forwarded-For"]).toBeUndefined();
      expect(headers["Content-Type"]).toBe("application/json");
      expect(headers["Content-Length"]).toBe(128);
      expect(headers["Cookie"]).toBe(dummyCookie);
      expect(headers["User-Agent"]).toBe("ChimpHood-LoadWorker/3");
    });

    it("injects deterministic RFC 5737 IP into X-Forwarded-For when simulateIps is true", () => {
      const headers = buildRequestHeaders({
        workerId: 10,
        sessionIndex: 10,
        cookie: dummyCookie,
        payloadLength: 64,
        simulateIps: true,
      }) as Record<string, any>;

      expect(headers["X-Forwarded-For"]).toBe("198.51.100.11");
      expect(headers["Cookie"]).toBe(dummyCookie);
      expect(headers["User-Agent"]).toBe("ChimpHood-LoadWorker/10");
    });

    it("maps concurrent workers wrapping around session count to the same session's IP", () => {
      // If 100 sessions exist, worker 0 and worker 100 share sessionIndex 0
      const headers0 = buildRequestHeaders({
        workerId: 0,
        sessionIndex: 0,
        cookie: dummyCookie,
        payloadLength: 50,
        simulateIps: true,
      }) as Record<string, any>;
      const headers100 = buildRequestHeaders({
        workerId: 100,
        sessionIndex: 0,
        cookie: dummyCookie,
        payloadLength: 50,
        simulateIps: true,
      }) as Record<string, any>;

      expect(headers0["X-Forwarded-For"]).toBe("198.51.100.1");
      expect(headers100["X-Forwarded-For"]).toBe("198.51.100.1");
    });
  });

  describe("4. CLI Flag Parser (hasFlag)", () => {
    it("detects flag presence accurately", () => {
      expect(hasFlag(["--connections", "50", "--simulate-ips"], "simulate-ips")).toBe(
        true,
      );
      expect(hasFlag(["--simulate-ips=true"], "simulate-ips")).toBe(true);
      expect(hasFlag(["--connections", "100"], "simulate-ips")).toBe(false);
      expect(hasFlag([], "simulate-ips")).toBe(false);
    });
  });
});

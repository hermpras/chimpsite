import { describe, it, expect, afterEach } from "vitest";
import { GET } from "@/app/api/auth/config/route";

describe("GET /api/auth/config", () => {
  const OLD = process.env.ALLOWED_CHAIN_IDS;
  afterEach(() => {
    if (OLD === undefined) delete process.env.ALLOWED_CHAIN_IDS;
    else process.env.ALLOWED_CHAIN_IDS = OLD;
  });

  it("returns the configured chain allowlist", async () => {
    process.env.ALLOWED_CHAIN_IDS = "1,137";
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowedChainIds: [1, 137] });
  });

  it("defaults to [1] when unset", async () => {
    delete process.env.ALLOWED_CHAIN_IDS;
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ allowedChainIds: [1] });
  });

  it("returns 500 on malformed configuration", async () => {
    process.env.ALLOWED_CHAIN_IDS = "not-a-chain";
    const res = await GET();
    expect(res.status).toBe(500);
  });
});

import { describe, it, expect } from "vitest";
import { readLimitedBody, MAX_JSON_BODY_BYTES } from "@/lib/auth/body-limit";

function req(body: BodyInit, contentLength?: string): Request {
  const headers: Record<string, string> = {};
  if (contentLength !== undefined) headers["content-length"] = contentLength;
  return new Request("http://localhost/x", { method: "POST", headers, body });
}

describe("readLimitedBody", () => {
  it("accepts a small body", async () => {
    const res = await readLimitedBody(req('{"a":1}'));
    expect(res).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("rejects when the declared content-length exceeds the limit", async () => {
    const res = await readLimitedBody(req("{}", String(MAX_JSON_BODY_BYTES + 1)));
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects when the actual body exceeds a custom limit", async () => {
    const res = await readLimitedBody(req("hello world"), 4);
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });

  it("ignores a malformed content-length and measures the actual body", async () => {
    const res = await readLimitedBody(req('{"a":1}', "not-a-number"));
    expect(res).toEqual({ ok: true, text: '{"a":1}' });
  });

  it("measures UTF-8 byte length, not character length", async () => {
    // 3 CJK chars = 9 UTF-8 bytes > limit of 8.
    const res = await readLimitedBody(req("\u4e2d\u6587\u5b57"), 8);
    expect(res).toEqual({ ok: false, reason: "too_large" });
  });
});

/**
 * Bounded request-body reading for the auth routes.
 *
 * The auth endpoints parse attacker-influenced JSON. Without a bound, a
 * huge body could spike memory during buffering/parsing. 8 KB is generous:
 * a SIWE message is under 2 KB and a signature is 132 chars. Real
 * production hardening belongs at the reverse proxy / CDN layer; this is
 * defense in depth at the application layer.
 */

/** Maximum JSON body size accepted by the auth routes. */
export const MAX_JSON_BODY_BYTES = 8 * 1024;

export type LimitedBodyResult =
  { ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" };

/**
 * Read the request body as text, enforcing a byte limit.
 *
 * A declared `Content-Length` over the limit is rejected without reading
 * the body. Otherwise the body is read and its actual UTF-8 byte length is
 * enforced, so a lying or missing Content-Length cannot bypass the limit.
 */
export async function readLimitedBody(
  request: Request,
  maxBytes: number = MAX_JSON_BODY_BYTES,
): Promise<LimitedBodyResult> {
  const declared = request.headers.get("content-length");
  if (declared !== null) {
    const n = Number(declared);
    if (Number.isInteger(n) && n >= 0 && n > maxBytes) {
      return { ok: false, reason: "too_large" };
    }
  }
  let text: string;
  try {
    text = await request.text();
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  if (new TextEncoder().encode(text).byteLength > maxBytes) {
    return { ok: false, reason: "too_large" };
  }
  return { ok: true, text };
}

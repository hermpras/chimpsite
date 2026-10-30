import type { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { sealData, unsealData } from "iron-session";
import { Redis } from "@upstash/redis";
import { getSessionOptions } from "@/lib/auth/session";
import { recordAuditLog } from "../audit/audit";
import { timingSafeEqualString } from "@/lib/auth/timing-safe";

export { timingSafeEqualString };

import { normalizeXAvatarUrl } from "@/lib/social/x-avatar";

export { normalizeXAvatarUrl };

export const X_OAUTH_COOKIE_NAME = "chimphood_x_oauth";
export const X_OAUTH_COOKIE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export interface XOAuthStatePayload {
  state: string;
  codeVerifier: string;
  userId: string;
  sessionId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Seals PKCE verifier and state in an iron-session encrypted string.
 */
export async function sealXOAuthState(payload: XOAuthStatePayload): Promise<string> {
  const { password } = getSessionOptions();
  return sealData(payload, { password, ttl: Math.floor(X_OAUTH_COOKIE_TTL_MS / 1000) });
}

/**
 * Unseals and verifies the PKCE verifier and state payload.
 */
export async function unsealXOAuthState(
  sealed: string,
): Promise<XOAuthStatePayload | null> {
  try {
    const { password } = getSessionOptions();
    const data = await unsealData<XOAuthStatePayload>(sealed, {
      password,
      ttl: Math.floor(X_OAUTH_COOKIE_TTL_MS / 1000),
    });
    if (!data || !data.state || !data.codeVerifier || !data.userId || !data.expiresAt) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

/**
 * Builds the Set-Cookie header for short-lived, HttpOnly OAuth state.
 */
export function buildXOAuthCookie(sealedValue: string): string {
  const isProd = process.env.NODE_ENV === "production";
  return `${X_OAUTH_COOKIE_NAME}=${encodeURIComponent(sealedValue)}; Path=/api/social/x; Max-Age=${Math.floor(X_OAUTH_COOKIE_TTL_MS / 1000)}; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;
}

/**
 * Builds the clearing Set-Cookie header.
 */
export function buildClearXOAuthCookie(): string {
  const isProd = process.env.NODE_ENV === "production";
  return `${X_OAUTH_COOKIE_NAME}=; Path=/api/social/x; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax${isProd ? "; Secure" : ""}`;
}

/**
 * Parses raw Cookie header string into key-value map.
 */
export function parseCookieHeader(cookieHeader: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const [name, ...valParts] = part.trim().split("=");
    if (name) {
      cookies[name] = decodeURIComponent(valParts.join("="));
    }
  }
  return cookies;
}

/**
 * Extracts and unseals X OAuth state from incoming Request or next/headers.
 */
export async function getXOAuthStateFromRequest(
  request: Request,
): Promise<XOAuthStatePayload | null> {
  let cookieVal: string | undefined = parseCookieHeader(request.headers.get("cookie"))[
    X_OAUTH_COOKIE_NAME
  ];
  if (!cookieVal) {
    try {
      const { cookies } = await import("next/headers");
      const cookieStore = await cookies();
      cookieVal = cookieStore.get(X_OAUTH_COOKIE_NAME)?.value;
    } catch {
      // outside next/headers request scope
    }
  }
  if (!cookieVal) return null;
  return unsealXOAuthState(cookieVal);
}

export class XOAuthError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number = 400) {
    super(message);
    this.name = "XOAuthError";
    this.code = code;
    this.status = status;
  }
}

export interface XOAuthRedisTarget {
  set(
    key: string,
    value: string,
    opts?: { ex?: number; nx?: boolean },
  ): Promise<string | null>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
}

export const X_OAUTH_STATE_TTL_SECONDS = 600; // 10 minutes (matches X_OAUTH_COOKIE_TTL_MS)
export const X_OAUTH_STATE_KEY_PREFIX = "@chimphood/oauth_state:";

let xRedisClient: Redis | null = null;
let customOAuthRedis: XOAuthRedisTarget | null = null;

// In-memory fallback for local development when Upstash Redis is not configured
const devMemoryOAuthState = new Map<string, { value: string; expiresAt: number }>();

const devMemoryRedisClient: XOAuthRedisTarget = {
  async set(
    key: string,
    value: string,
    options?: { ex?: number; nx?: boolean },
  ): Promise<string | null> {
    const now = Date.now();
    const existing = devMemoryOAuthState.get(key);
    if (existing && existing.expiresAt > now) {
      if (options?.nx) {
        return null;
      }
    }
    const ttlMs = (options?.ex ?? X_OAUTH_STATE_TTL_SECONDS) * 1000;
    devMemoryOAuthState.set(key, { value, expiresAt: now + ttlMs });
    return "OK";
  },
  async get(key: string): Promise<string | null> {
    const now = Date.now();
    const entry = devMemoryOAuthState.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now) {
      devMemoryOAuthState.delete(key);
      return null;
    }
    return entry.value;
  },
  async del(key: string): Promise<number> {
    return devMemoryOAuthState.delete(key) ? 1 : 0;
  },
};

function getXRedisClient(): XOAuthRedisTarget {
  if (customOAuthRedis) {
    return customOAuthRedis;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    if (process.env.NODE_ENV === "development") {
      return devMemoryRedisClient;
    }
    throw new XOAuthError(
      "OAUTH_STORAGE_NOT_CONFIGURED",
      "Missing Upstash Redis credentials for OAuth state storage. UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be configured.",
      500,
    );
  }

  if (!xRedisClient) {
    xRedisClient = new Redis({ url, token });
  }
  return xRedisClient;
}

/**
 * Atomically marks OAuth state as consumed in shared Redis storage with TTL.
 * Returns false if state was already consumed (preventing replay attacks).
 * Fails closed if Redis is unavailable or unconfigured.
 */
export async function markStateConsumed(state: string): Promise<boolean> {
  const redis = getXRedisClient();
  const key = `${X_OAUTH_STATE_KEY_PREFIX}${state}`;

  try {
    const result = await redis.set(key, "1", {
      ex: X_OAUTH_STATE_TTL_SECONDS,
      nx: true,
    });
    return result === "OK";
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      throw err;
    }
    console.error("markStateConsumed Redis failure:", err);
    throw new XOAuthError(
      "OAUTH_STORAGE_ERROR",
      "OAuth state storage unavailable due to Redis failure.",
      500,
    );
  }
}

/**
 * Checks whether an OAuth state has already been consumed in Redis storage.
 */
export async function isStateConsumed(state: string): Promise<boolean> {
  const redis = getXRedisClient();
  const key = `${X_OAUTH_STATE_KEY_PREFIX}${state}`;

  try {
    const result = await redis.get(key);
    return result !== null;
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      throw err;
    }
    console.error("isStateConsumed Redis failure:", err);
    throw new XOAuthError(
      "OAUTH_STORAGE_ERROR",
      "OAuth state storage unavailable due to Redis failure.",
      500,
    );
  }
}

/**
 * Clears a consumed state from Redis storage (DEL).
 */
export async function clearConsumedState(state: string): Promise<void> {
  const redis = getXRedisClient();
  const key = `${X_OAUTH_STATE_KEY_PREFIX}${state}`;

  try {
    await redis.del(key);
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      throw err;
    }
    console.error("clearConsumedState Redis failure:", err);
    throw new XOAuthError(
      "OAUTH_STORAGE_ERROR",
      "OAuth state storage unavailable due to Redis failure.",
      500,
    );
  }
}

/**
 * Test hook: resets cached Redis connection or custom test mock.
 */
export function __clearConsumedOAuthStates(): void {
  xRedisClient = null;
  customOAuthRedis = null;
}

/**
 * Test hook: injects a custom Redis target for isolated testing.
 */
export function __setTestOAuthRedis(client: XOAuthRedisTarget | null): void {
  customOAuthRedis = client;
}

export interface XConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export function getXConfig(): XConfig | null {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;
  const redirectUri = process.env.X_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return null;
  }

  return { clientId, clientSecret, redirectUri };
}

export function isXConfigured(): boolean {
  return getXConfig() !== null;
}

/**
 * Builds the Twitter/X OAuth 2.0 Authorization URL with PKCE.
 * Fails closed if X integration environment variables are not configured.
 */
export function buildXAuthUrl(state: string, codeChallenge: string): string {
  const config = getXConfig();
  if (!config) {
    throw new XOAuthError(
      "X_OAUTH_NOT_CONFIGURED",
      "X OAuth 2.0 is not configured in this environment.",
      503,
    );
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: "tweet.read users.read offline.access",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `https://twitter.com/i/oauth2/authorize?${params.toString()}`;
}

/**
 * Server-side OAuth 2.0 PKCE token exchange and identity linking.
 * Never fakes linking without valid provider verification.
 */
export async function linkXAccountWithCode(
  prisma: PrismaClient,
  input: {
    userId: string;
    code: string;
    codeVerifier: string;
  },
) {
  const config = getXConfig();
  if (!config) {
    throw new XOAuthError(
      "X_OAUTH_NOT_CONFIGURED",
      "X OAuth 2.0 is not configured in this environment.",
      503,
    );
  }

  const tokenParams = new URLSearchParams({
    code: input.code,
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code_verifier: input.codeVerifier,
  });

  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString(
    "base64",
  );

  const tokenRes = await fetch("https://api.twitter.com/2/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: tokenParams.toString(),
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    console.error(
      "X OAuth token exchange failed (HTTP %d): %s",
      tokenRes.status,
      errorText,
    );
    throw new XOAuthError(
      "X_TOKEN_EXCHANGE_FAILED",
      "Failed to exchange authorization code with X.",
      400,
    );
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch authenticated user profile
  const meRes = await fetch(
    "https://api.twitter.com/2/users/me?user.fields=profile_image_url",
    {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    },
  );

  if (!meRes.ok) {
    throw new XOAuthError(
      "X_USER_FETCH_FAILED",
      "Failed to fetch profile information from X API.",
      400,
    );
  }

  const meData = (await meRes.json()) as {
    data: {
      id: string;
      username: string;
      name?: string;
      profile_image_url?: string;
    };
  };

  const xId = meData.data.id;
  const username = meData.data.username;

  // Check if another user has already linked this X ID
  const existingWithXId = await prisma.xIdentity.findUnique({
    where: { xId },
  });
  if (existingWithXId && existingWithXId.userId !== input.userId) {
    throw new XOAuthError(
      "X_ACCOUNT_ALREADY_LINKED",
      "This X account is already linked to another ChimpHood profile.",
      409,
    );
  }

  // Upsert X identity for the user and record audit log atomically
  const runTransaction =
    typeof (prisma as any).$transaction === "function"
      ? (fn: (tx: any) => Promise<any>) => (prisma as any).$transaction(fn)
      : (fn: (tx: any) => Promise<any>) => fn(prisma);

  const xIdentity = await runTransaction(async (tx) => {
    const record = await tx.xIdentity.upsert({
      where: { userId: input.userId },
      create: {
        userId: input.userId,
        xId,
        username,
        name: meData.data.name ?? null,
        profileImageUrl: normalizeXAvatarUrl(meData.data.profile_image_url),
      },
      update: {
        xId,
        username,
        name: meData.data.name ?? null,
        profileImageUrl: normalizeXAvatarUrl(meData.data.profile_image_url),
      },
    });

    await recordAuditLog(tx, {
      actorId: input.userId,
      action: "X_IDENTITY_LINKED",
      entityType: "XIdentity",
      entityId: record.id,
      newValues: {
        userId: input.userId,
        xId,
        username,
      },
      metadata: {
        name: meData.data.name ?? null,
      },
    });

    return record;
  });

  return xIdentity;
}

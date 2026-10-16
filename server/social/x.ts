import type { PrismaClient } from "@prisma/client";
import crypto from "node:crypto";
import { sealData, unsealData } from "iron-session";
import { getSessionOptions } from "@/lib/auth/session";

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

/**
 * Constant-time string comparison to prevent timing attacks on state validation.
 */
export function timingSafeEqualString(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// In-memory replay tracking for consumed OAuth states
const consumedOAuthStates = new Set<string>();

/**
 * Atomically marks state as consumed. Returns false if state was already consumed.
 */
export function markStateConsumed(state: string): boolean {
  if (consumedOAuthStates.has(state)) {
    return false;
  }
  consumedOAuthStates.add(state);
  const timer = setTimeout(
    () => {
      consumedOAuthStates.delete(state);
    },
    15 * 60 * 1000,
  );
  timer.unref?.();
  return true;
}

export function isStateConsumed(state: string): boolean {
  return consumedOAuthStates.has(state);
}

export function __clearConsumedOAuthStates(): void {
  consumedOAuthStates.clear();
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
    throw new XOAuthError(
      "X_TOKEN_EXCHANGE_FAILED",
      `Failed to exchange token with X: ${errorText}`,
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

  // Upsert X identity for the user
  const xIdentity = await prisma.xIdentity.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      xId,
      username,
      name: meData.data.name ?? null,
      profileImageUrl: meData.data.profile_image_url ?? null,
    },
    update: {
      xId,
      username,
      name: meData.data.name ?? null,
      profileImageUrl: meData.data.profile_image_url ?? null,
    },
  });

  return xIdentity;
}

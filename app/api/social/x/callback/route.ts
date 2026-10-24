import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  linkXAccountWithCode,
  XOAuthError,
  isXConfigured,
  getXOAuthStateFromRequest,
  timingSafeEqualString,
  markStateConsumed,
  buildClearXOAuthCookie,
} from "@/server/social/x";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");

  const clearCookieHeader = { "Set-Cookie": buildClearXOAuthCookie() };

  if (!isXConfigured()) {
    return Response.json(
      { error: "X_OAUTH_NOT_CONFIGURED", message: "X OAuth is not configured." },
      { status: 503, headers: clearCookieHeader },
    );
  }

  // Handle provider-side errors returned in callback query params (e.g. user denied consent)
  if (providerError) {
    return Response.json(
      {
        error: "X_OAUTH_PROVIDER_ERROR",
        message:
          providerErrorDescription || `X OAuth authorization error: ${providerError}`,
      },
      { status: 400, headers: clearCookieHeader },
    );
  }

  if (!code || !state) {
    return Response.json(
      {
        error: "INVALID_CALLBACK",
        message: "Missing code or state parameter.",
      },
      { status: 400, headers: clearCookieHeader },
    );
  }

  // Extract PKCE verifier and state strictly from the sealed HttpOnly cookie
  const oauthState = await getXOAuthStateFromRequest(request);
  if (!oauthState) {
    return Response.json(
      {
        error: "INVALID_OAUTH_STATE",
        message: "Missing or invalid OAuth state cookie.",
      },
      { status: 400, headers: clearCookieHeader },
    );
  }

  // Check TTL expiration
  if (Date.now() > oauthState.expiresAt) {
    return Response.json(
      {
        error: "OAUTH_STATE_EXPIRED",
        message: "OAuth state has expired. Please initiate connection again.",
      },
      { status: 400, headers: clearCookieHeader },
    );
  }

  // Timing-safe comparison of OAuth state
  if (!timingSafeEqualString(oauthState.state, state)) {
    return Response.json(
      {
        error: "INVALID_OAUTH_STATE",
        message: "OAuth state mismatch.",
      },
      { status: 400, headers: clearCookieHeader },
    );
  }

  // Prevent replay of already-consumed OAuth state
  try {
    const isFirstUse = await markStateConsumed(state);
    if (!isFirstUse) {
      return Response.json(
        {
          error: "OAUTH_STATE_REPLAYED",
          message: "OAuth state has already been consumed.",
        },
        { status: 400, headers: clearCookieHeader },
      );
    }
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status, headers: clearCookieHeader },
      );
    }
    console.error("GET /api/social/x/callback replay check error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to verify OAuth state." },
      { status: 500, headers: clearCookieHeader },
    );
  }

  if (!oauthState.codeVerifier) {
    return Response.json(
      {
        error: "INVALID_OAUTH_STATE",
        message: "Missing PKCE code verifier.",
      },
      { status: 400, headers: clearCookieHeader },
    );
  }

  // Authenticate current session
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Session required." },
      { status: 401, headers: clearCookieHeader },
    );
  }

  // Bind OAuth flow to initiating authenticated session to prevent linking to wrong wallet
  if (
    session.userId !== oauthState.userId ||
    (oauthState.sessionId && session.sessionId !== oauthState.sessionId)
  ) {
    return Response.json(
      {
        error: "SESSION_MISMATCH",
        message: "OAuth flow was initiated by a different user session.",
      },
      { status: 403, headers: clearCookieHeader },
    );
  }

  try {
    const xIdentity = await linkXAccountWithCode(prisma, {
      userId: session.userId,
      code,
      codeVerifier: oauthState.codeVerifier,
    });

    return Response.json({ success: true, xIdentity }, { headers: clearCookieHeader });
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      return Response.json(
        { error: err.code, message: err.message },
        { status: err.status, headers: clearCookieHeader },
      );
    }
    console.error("GET /api/social/x/callback error:", err);
    return Response.json(
      { error: "SERVER_ERROR", message: "Failed to link X account." },
      { status: 500, headers: clearCookieHeader },
    );
  }
}

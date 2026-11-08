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

function respondWithError(
  request: Request,
  errorCode: string,
  message: string,
  status: number,
  clearCookieHeader: Record<string, string>,
): Response {
  const accept = request.headers.get("accept") || "";
  const secFetchDest = request.headers.get("sec-fetch-dest");
  const secFetchMode = request.headers.get("sec-fetch-mode");

  const isBrowser =
    secFetchDest === "document" ||
    secFetchMode === "navigate" ||
    accept.includes("text/html");

  if (isBrowser) {
    const errorUrl = new URL("/social/x/error", request.url);
    errorUrl.searchParams.set("error", errorCode);
    errorUrl.searchParams.set("message", message);
    return new Response(null, {
      status: 302,
      headers: {
        Location: errorUrl.toString(),
        ...clearCookieHeader,
      },
    });
  }

  return Response.json(
    { error: errorCode, message },
    { status, headers: clearCookieHeader },
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const providerError = url.searchParams.get("error");
  const providerErrorDescription = url.searchParams.get("error_description");

  const clearCookieHeader = { "Set-Cookie": buildClearXOAuthCookie() };

  if (!isXConfigured()) {
    return respondWithError(
      request,
      "X_OAUTH_NOT_CONFIGURED",
      "X OAuth is not configured.",
      503,
      clearCookieHeader,
    );
  }

  // Handle provider-side errors returned in callback query params (e.g. user denied consent)
  if (providerError) {
    return respondWithError(
      request,
      "X_OAUTH_PROVIDER_ERROR",
      providerErrorDescription || `X OAuth authorization error: ${providerError}`,
      400,
      clearCookieHeader,
    );
  }

  if (!code || !state) {
    return respondWithError(
      request,
      "INVALID_CALLBACK",
      "Missing code or state parameter.",
      400,
      clearCookieHeader,
    );
  }

  // Extract PKCE verifier and state strictly from the sealed HttpOnly cookie
  const oauthState = await getXOAuthStateFromRequest(request);
  if (!oauthState) {
    return respondWithError(
      request,
      "INVALID_OAUTH_STATE",
      "Missing or invalid OAuth state cookie.",
      400,
      clearCookieHeader,
    );
  }

  // Check TTL expiration
  if (Date.now() > oauthState.expiresAt) {
    return respondWithError(
      request,
      "OAUTH_STATE_EXPIRED",
      "OAuth state has expired. Please initiate connection again.",
      400,
      clearCookieHeader,
    );
  }

  // Timing-safe comparison of OAuth state
  if (!timingSafeEqualString(oauthState.state, state)) {
    return respondWithError(
      request,
      "INVALID_OAUTH_STATE",
      "OAuth state mismatch.",
      400,
      clearCookieHeader,
    );
  }

  // Prevent replay of already-consumed OAuth state
  try {
    const isFirstUse = await markStateConsumed(state);
    if (!isFirstUse) {
      return respondWithError(
        request,
        "OAUTH_STATE_REPLAYED",
        "OAuth state has already been consumed.",
        400,
        clearCookieHeader,
      );
    }
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      return respondWithError(
        request,
        err.code,
        err.message,
        err.status,
        clearCookieHeader,
      );
    }
    console.error("GET /api/social/x/callback replay check error:", err);
    return respondWithError(
      request,
      "SERVER_ERROR",
      "Failed to verify OAuth state.",
      500,
      clearCookieHeader,
    );
  }

  if (!oauthState.codeVerifier) {
    return respondWithError(
      request,
      "INVALID_OAUTH_STATE",
      "Missing PKCE code verifier.",
      400,
      clearCookieHeader,
    );
  }

  // Authenticate current session
  const session = await authenticateRequest(prisma);
  if (!session) {
    return respondWithError(
      request,
      "UNAUTHORIZED",
      "Session required.",
      401,
      clearCookieHeader,
    );
  }

  // Bind OAuth flow to initiating authenticated session to prevent linking to wrong wallet
  if (
    session.userId !== oauthState.userId ||
    (oauthState.sessionId && session.sessionId !== oauthState.sessionId)
  ) {
    return respondWithError(
      request,
      "SESSION_MISMATCH",
      "OAuth flow was initiated by a different user session.",
      403,
      clearCookieHeader,
    );
  }

  try {
    await linkXAccountWithCode(prisma, {
      userId: session.userId,
      code,
      codeVerifier: oauthState.codeVerifier,
    });

    const redirectUrl = new URL("/profile?x_linked=1", request.url);
    return new Response(null, {
      status: 302,
      headers: {
        Location: redirectUrl.toString(),
        ...clearCookieHeader,
      },
    });
  } catch (err: unknown) {
    if (err instanceof XOAuthError) {
      return respondWithError(
        request,
        err.code,
        err.message,
        err.status,
        clearCookieHeader,
      );
    }
    console.error("GET /api/social/x/callback error:", err);
    return respondWithError(
      request,
      "SERVER_ERROR",
      "Failed to link X account.",
      500,
      clearCookieHeader,
    );
  }
}

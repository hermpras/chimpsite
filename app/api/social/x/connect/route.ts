import { prisma } from "@/server/db";
import { authenticateRequest } from "@/server/auth/session";
import {
  buildXAuthUrl,
  isXConfigured,
  sealXOAuthState,
  buildXOAuthCookie,
  X_OAUTH_COOKIE_TTL_MS,
  type XOAuthStatePayload,
} from "@/server/social/x";
import crypto from "node:crypto";

export async function GET(): Promise<Response> {
  const session = await authenticateRequest(prisma);
  if (!session) {
    return Response.json(
      { error: "UNAUTHORIZED", message: "Sign in with wallet before connecting X." },
      { status: 401 },
    );
  }

  if (!isXConfigured()) {
    return Response.json(
      {
        error: "X_OAUTH_NOT_CONFIGURED",
        message:
          "X (Twitter) OAuth 2.0 application credentials are not configured in this environment.",
      },
      { status: 503 },
    );
  }

  const state = crypto.randomBytes(16).toString("hex");
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  const now = Date.now();
  const oauthPayload: XOAuthStatePayload = {
    state,
    codeVerifier,
    userId: session.userId,
    sessionId: session.sessionId,
    createdAt: now,
    expiresAt: now + X_OAUTH_COOKIE_TTL_MS,
  };

  const sealedState = await sealXOAuthState(oauthPayload);
  const cookieHeader = buildXOAuthCookie(sealedState);

  const authUrl = buildXAuthUrl(state, codeChallenge);

  return Response.json(
    {
      url: authUrl,
      state,
    },
    {
      headers: {
        "Set-Cookie": cookieHeader,
      },
    },
  );
}

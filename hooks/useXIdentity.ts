"use client";
import { useState, useEffect, useCallback } from "react";
import { useSiweAuth } from "./useSiweAuth";

interface XIdentityState {
  xUsername: string | null;
  xName: string | null;
  xProfileImageUrl: string | null;
  isConnected: boolean;
}

/**
 * Lightweight hook that fetches X (Twitter) identity for the currently
 * authenticated wallet session.  Returns null values when not connected.
 *
 * Re-fetches automatically on:
 *  - wallet auth status changes (via useSiweAuth)
 *  - "chimphood:siwe-auth-change" custom DOM events (login / logout)
 */
export function useXIdentity(): XIdentityState {
  const { status } = useSiweAuth();
  const [state, setState] = useState<XIdentityState>({
    xUsername: null,
    xName: null,
    xProfileImageUrl: null,
    isConnected: false,
  });

  const fetchXStatus = useCallback(async () => {
    if (status !== "authenticated") {
      setState({ xUsername: null, xName: null, xProfileImageUrl: null, isConnected: false });
      return;
    }
    try {
      const res = await fetch("/api/social/x/status");
      if (!res.ok) return;
      const data = (await res.json()) as {
        connected?: boolean;
        identity?: {
          username?: string;
          name?: string;
          profileImageUrl?: string;
        };
      };
      setState({
        xUsername: data?.identity?.username ?? null,
        xName: data?.identity?.name ?? null,
        xProfileImageUrl: data?.identity?.profileImageUrl ?? null,
        isConnected: Boolean(data?.connected),
      });
    } catch {
      // best-effort; keep previous state on network errors
    }
  }, [status]);

  useEffect(() => {
    void fetchXStatus();
    window.addEventListener("chimphood:siwe-auth-change", fetchXStatus);
    return () =>
      window.removeEventListener("chimphood:siwe-auth-change", fetchXStatus);
  }, [fetchXStatus]);

  return state;
}

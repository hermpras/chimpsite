"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { getAvatarPublicUrl, triggerAvatarRender } from "@/lib/inventory/avatar-client";

export interface UserAvatarProps {
  identifier?: string | null;
  hasInventory?: boolean;
  version?: number | string | null;
  size?: "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
  fallbackIconClassName?: string;
  showRefreshButton?: boolean;
  onRefresh?: () => Promise<void> | void;
}

const SIZE_CONTAINER_CLASSES = {
  sm: "h-5 w-5 rounded-full text-xs",
  md: "h-10 w-10 rounded-xl text-sm",
  lg: "h-20 w-20 sm:h-24 sm:w-24 rounded-2xl text-base",
  xl: "h-28 w-28 sm:h-32 sm:w-32 rounded-3xl text-lg",
  "2xl": "h-52 w-52 sm:h-60 sm:w-60 rounded-3xl text-xl",
};

const SIZE_ICON_CLASSES = {
  sm: "h-3.5 w-3.5",
  md: "h-5 w-5",
  lg: "h-9 w-9",
  xl: "h-12 w-12",
  "2xl": "h-20 w-20",
};

export function UserAvatar({
  identifier,
  hasInventory,
  version,
  size = "md",
  className = "",
  fallbackIconClassName,
  showRefreshButton = false,
  onRefresh,
}: UserAvatarProps) {
  const [internalVersion, setInternalVersion] = useState<number | null>(() => {
    if (typeof window !== "undefined") {
      try {
        const stored = localStorage.getItem("chimphood_avatar_version");
        if (stored) return Number(stored);
      } catch {}
    }
    return null;
  });

  React.useEffect(() => {
    const handleAvatarUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ version?: number }>;
      setInternalVersion(customEvent.detail?.version ?? Date.now());
    };
    const handleStorage = (e: StorageEvent) => {
      if (e.key === "chimphood_avatar_version" && e.newValue) {
        setInternalVersion(Number(e.newValue));
      }
    };
    window.addEventListener("avatar-updated", handleAvatarUpdate);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("avatar-updated", handleAvatarUpdate);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const effectiveVersion = version ?? internalVersion;
  const currentKey = `${identifier || ""}-${effectiveVersion || ""}`;
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [isReRendering, setIsReRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);

  const imgLoaded = loadedKey === currentKey;
  const imgError = errorKey === currentKey;

  const isSm = size === "sm";
  const iconClass = fallbackIconClassName || SIZE_ICON_CLASSES[size];
  const containerClass = SIZE_CONTAINER_CLASSES[size];

  const handleManualReRender = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReRendering(true);
    setRenderError(null);
    try {
      await triggerAvatarRender();
      const v = Date.now();
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("chimphood_avatar_version", String(v));
          window.dispatchEvent(
            new CustomEvent("avatar-updated", { detail: { version: v } }),
          );
        } catch {}
      }
      if (onRefresh) {
        await onRefresh();
      }
      setLoadedKey(null);
      setErrorKey(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to re-render avatar.";
      setRenderError(msg);
    } finally {
      setIsReRendering(false);
    }
  };

  // State 1: Fallback (No identifier or user explicitly has no inventory items)
  if (!identifier || hasInventory === false) {
    return (
      <div
        data-testid={isSm ? "navbar-avatar-fallback" : "avatar-fallback"}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-[#163B44] bg-[#0B2026] text-gray-400 shadow-inner ${containerClass} ${className}`}
        title={identifier ? "Base Chimp (no traits in inventory)" : "No character avatar"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/chimp-base-bw.png"
          alt="Base Chimp"
          className="h-full w-full object-cover [image-rendering:pixelated] opacity-85"
        />
      </div>
    );
  }

  // State 2: Explicit render error (e.g. manual re-render failed on server)
  if (renderError) {
    if (isSm) {
      return (
        <div
          data-testid="navbar-avatar-fallback"
          className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-[#163B44] bg-[#0B2026] text-gray-400 ${containerClass} ${className}`}
          title="Avatar unavailable"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/chimp-base-bw.png"
            alt="Base Chimp"
            className="h-full w-full object-cover [image-rendering:pixelated] opacity-85"
          />
        </div>
      );
    }

    return (
      <div className="relative inline-block">
        <div
          data-testid="avatar-error"
          className={`relative flex shrink-0 flex-col items-center justify-center overflow-hidden border border-rose-900/50 bg-rose-950/20 text-rose-400 shadow-inner ${containerClass} ${className}`}
          title={renderError}
        >
          <span className="text-xs font-semibold text-rose-300 uppercase tracking-wider">Error</span>
        </div>
        {showRefreshButton && (
          <button
            type="button"
            data-testid="avatar-retry-btn"
            onClick={handleManualReRender}
            disabled={isReRendering}
            className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-[#163B44] bg-[#0B2026] text-gray-300 shadow hover:bg-[#102B33] hover:text-white cursor-pointer"
            title="Retry Avatar Render"
          >
            <RefreshCw className={`h-3 w-3 ${isReRendering ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>
    );
  }

  // State 3: Image failed to load (e.g. 404 because user has no active traits yet).
  // Gracefully fallback to clean Base Chimp avatar instead of an alarming red error badge.
  if (imgError) {
    return (
      <div
        data-testid={isSm ? "navbar-avatar-fallback" : "avatar-fallback"}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-[#163B44] bg-[#0B2026] text-gray-400 shadow-inner ${containerClass} ${className}`}
        title="No character avatar (no traits in inventory)"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/chimp-base-bw.png"
          alt="Base Chimp"
          className="h-full w-full object-cover [image-rendering:pixelated] opacity-85"
        />
      </div>
    );
  }

  const avatarUrl = getAvatarPublicUrl(identifier, effectiveVersion);

  // State 4: Loading & Loaded Image
  return (
    <div className="relative inline-block">
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-[#163B44] bg-[#0B2026] shadow-inner ${containerClass} ${className}`}
      >
        {/* Loading overlay */}
        {!imgLoaded && (
          <div
            data-testid="avatar-loading"
            className="absolute inset-0 z-10 flex items-center justify-center bg-[#0B2026]/90 text-emerald-400 font-mono text-[9px] uppercase tracking-wider"
          >
            {isSm ? "..." : "Loading"}
          </div>
        )}

        {/* Character Avatar Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentKey}
          src={avatarUrl}
          alt="Elychimp Character Avatar"
          data-testid={isSm ? "navbar-avatar" : "avatar-image"}
          className={`h-full w-full object-cover transition-opacity duration-200 ${
            imgLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoadedKey(currentKey)}
          onError={() => setErrorKey(currentKey)}
        />
      </div>

      {/* Optional Refresh/Re-render Button (visually hidden on luxury profile card, accessible for programmatic/test refresh) */}
      {showRefreshButton && !isSm && (
        <button
          type="button"
          data-testid="avatar-refresh-btn"
          onClick={handleManualReRender}
          disabled={isReRendering}
          className="sr-only"
          title="Re-render Avatar"
        >
          Re-render Avatar
        </button>
      )}
    </div>
  );
}

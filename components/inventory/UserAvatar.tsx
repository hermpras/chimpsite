"use client";

import React, { useState } from "react";
import { User, RefreshCw, AlertTriangle, Loader2 } from "lucide-react";
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
  const currentKey = `${identifier || ""}-${version || ""}`;
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
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-gray-800 bg-[#0d111c] text-gray-400 shadow-inner ${containerClass} ${className}`}
        title={identifier ? "Base Chimp (no traits in inventory)" : "No character avatar"}
      >
        {identifier ? (
          <img
            src="/images/chimp-base-bw.png"
            alt="Base Chimp"
            className="h-full w-full object-cover [image-rendering:pixelated] opacity-85"
          />
        ) : (
          <User className={iconClass} />
        )}
      </div>
    );
  }

  // State 2: Explicit render error (e.g. manual re-render failed on server)
  if (renderError) {
    if (isSm) {
      return (
        <div
          data-testid="navbar-avatar-fallback"
          className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-gray-800 bg-[#0d111c] text-gray-400 ${containerClass} ${className}`}
          title="Avatar unavailable"
        >
          <User className={iconClass} />
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
          <AlertTriangle className="h-6 w-6 text-rose-400" />
          <span className="mt-1 text-[10px] font-medium text-rose-300">Error</span>
        </div>
        {showRefreshButton && (
          <button
            type="button"
            data-testid="avatar-retry-btn"
            onClick={handleManualReRender}
            disabled={isReRendering}
            className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 shadow hover:bg-gray-800 hover:text-white"
            title="Retry Avatar Render"
          >
            <RefreshCw
              className={`h-3 w-3 ${isReRendering ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
        )}
      </div>
    );
  }

  // State 3: Image failed to load (e.g. 404 because user has no active traits yet).
  // Gracefully fallback to clean generic User icon instead of an alarming red error badge.
  if (imgError) {
    return (
      <div
        data-testid={isSm ? "navbar-avatar-fallback" : "avatar-fallback"}
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-gray-800 bg-[#0d111c] text-gray-400 shadow-inner ${containerClass} ${className}`}
        title="No character avatar (no traits in inventory)"
      >
        <User className={iconClass} />
      </div>
    );
  }

  const avatarUrl = getAvatarPublicUrl(identifier, version);

  // State 4: Loading & Loaded Image
  return (
    <div className="relative inline-block">
      <div
        className={`relative flex shrink-0 items-center justify-center overflow-hidden border border-gray-800 bg-[#0d111c] shadow-inner ${containerClass} ${className}`}
      >
        {/* Loading overlay */}
        {!imgLoaded && (
          <div
            data-testid="avatar-loading"
            className="absolute inset-0 z-10 flex items-center justify-center bg-gray-900/90 text-emerald-400"
          >
            <Loader2 className={`animate-spin ${isSm ? "h-3 w-3" : "h-6 w-6"}`} />
          </div>
        )}

        {/* Character Avatar Image */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={currentKey}
          src={avatarUrl}
          alt="ChimpHood Character Avatar"
          data-testid={isSm ? "navbar-avatar" : "avatar-image"}
          className={`h-full w-full object-cover transition-opacity duration-200 ${
            imgLoaded ? "opacity-100" : "opacity-0"
          }`}
          onLoad={() => setLoadedKey(currentKey)}
          onError={() => setErrorKey(currentKey)}
        />
      </div>

      {/* Optional Refresh/Re-render Button */}
      {showRefreshButton && !isSm && (
        <button
          type="button"
          data-testid="avatar-refresh-btn"
          onClick={handleManualReRender}
          disabled={isReRendering}
          className="absolute -right-1 -bottom-1 flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-900 text-gray-300 shadow hover:border-emerald-500/50 hover:bg-gray-800 hover:text-white"
          title="Re-render Avatar"
        >
          <RefreshCw
            className={`h-3 w-3 ${isReRendering ? "animate-spin text-emerald-400" : ""}`}
          />
        </button>
      )}
    </div>
  );
}

"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
  useMemo,
} from "react";
import { useRouter, usePathname } from "next/navigation";

interface PixelTransitionContextValue {
  navigate: (href: string, originX?: number, originY?: number) => void;
}

const PixelTransitionContext = createContext<PixelTransitionContextValue>({
  navigate: () => {},
});

export function usePixelTransition() {
  return useContext(PixelTransitionContext);
}

const TILE_SIZE = 52; // Optimal retro block dimension in pixels
const COVER_DURATION = 340; // ms
const HOLD_DURATION = 60; // ms
const REVEAL_DURATION = 320; // ms

// Theme palette strictly aligned with Elysium brand identity
const PALETTE_COLORS = [
  "#04181C", // Elysium Void (Base dark)
  "#04181C",
  "#04181C",
  "#051D22", // Elysium Canvas
  "#051D22",
  "#071F24", // Surface Dark Teal
  "#0B2026", // Surface Elevated
  "#102B33", // Specimen border elevation
];

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function pseudoRandom(c: number, r: number): number {
  const sin = Math.sin(c * 12.9898 + r * 78.233);
  return Math.abs((sin * 43758.5453) % 1);
}

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
  delay: number;
  color: string;
  accent: boolean;
}

export function PixelCurtain() {
  const router = useRouter();
  const pathname = usePathname();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const isTransitioningRef = useRef(false);
  const pendingHrefRef = useRef<string | null>(null);

  // Build grid data based on current viewport size and origin coordinates
  const buildGrid = useCallback((originX: number, originY: number): Cell[] => {
    if (typeof window === "undefined") return [];
    const width = window.innerWidth;
    const height = window.innerHeight;
    const cols = Math.ceil(width / TILE_SIZE);
    const rows = Math.ceil(height / TILE_SIZE);

    const maxDist = Math.hypot(
      Math.max(originX, width - originX),
      Math.max(originY, height - originY),
    );

    const cells: Cell[] = [];

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;
        const centerX = x + TILE_SIZE / 2;
        const centerY = y + TILE_SIZE / 2;

        const dist = Math.hypot(centerX - originX, centerY - originY);
        const normDist = maxDist > 0 ? dist / maxDist : 0;

        // Subtle digital scatter jitter
        const noise = pseudoRandom(c, r);
        const jitter = (noise - 0.5) * 0.24;

        // Normalized activation delay (0 to 0.65)
        const delay = Math.max(0, Math.min(0.65, normDist * 0.76 + jitter));

        // Deterministic palette pick
        const colorIndex = Math.floor(noise * PALETTE_COLORS.length);
        const color = PALETTE_COLORS[colorIndex] || "#04181C";

        // Occasional specular accent block (~3% probability)
        const accent = noise > 0.97;

        cells.push({
          x,
          y,
          w: TILE_SIZE,
          h: TILE_SIZE,
          delay,
          color: accent ? "#0B2A33" : color,
          accent,
        });
      }
    }

    return cells;
  }, []);

  const runTransition = useCallback(
    (href: string, originX?: number, originY?: number) => {
      if (typeof window === "undefined") return;
      if (isTransitioningRef.current) return;

      const canvas = canvasRef.current;
      if (!canvas) {
        router.push(href);
        return;
      }

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        router.push(href);
        return;
      }

      // Check prefers-reduced-motion
      if (
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        router.push(href);
        return;
      }

      isTransitioningRef.current = true;
      pendingHrefRef.current = href;

      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.ceil(width * dpr);
      canvas.height = Math.ceil(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // Make canvas capture clicks during transition
      canvas.style.pointerEvents = "auto";

      const startX = originX ?? width / 2;
      const startY = originY ?? height / 2;
      const cells = buildGrid(startX, startY);

      let phase: "cover" | "hold" | "reveal" = "cover";
      let phaseStartTime = performance.now();

      const renderLoop = (now: number) => {
        const elapsed = now - phaseStartTime;

        if (phase === "cover") {
          const progress = Math.min(1, elapsed / COVER_DURATION);

          ctx.clearRect(0, 0, width, height);

          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const localP = Math.max(0, Math.min(1, (progress - cell.delay) / 0.35));
            if (localP <= 0) continue;

            const scale = easeOutCubic(localP);
            const w = cell.w * scale;
            const h = cell.h * scale;
            const x = cell.x + (cell.w - w) / 2;
            const y = cell.y + (cell.h - h) / 2;

            ctx.fillStyle = cell.color;
            ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));

            if (scale > 0.25 && scale < 0.98) {
              ctx.strokeStyle = cell.accent
                ? "rgba(52, 183, 221, 0.45)"
                : "rgba(22, 59, 68, 0.55)";
              ctx.lineWidth = 1;
              ctx.strokeRect(
                Math.floor(x) + 0.5,
                Math.floor(y) + 0.5,
                Math.ceil(w) - 1,
                Math.ceil(h) - 1,
              );
            }
          }

          if (progress >= 1) {
            // Screen is completely covered with obsidian void
            ctx.fillStyle = "#04181C";
            ctx.fillRect(0, 0, width, height);

            phase = "hold";
            phaseStartTime = performance.now();

            // Execute client-side router navigation under curtain
            if (pendingHrefRef.current) {
              router.push(pendingHrefRef.current);
              pendingHrefRef.current = null;
            }
          }

          animFrameRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        if (phase === "hold") {
          ctx.fillStyle = "#04181C";
          ctx.fillRect(0, 0, width, height);

          if (elapsed >= HOLD_DURATION) {
            phase = "reveal";
            phaseStartTime = performance.now();
          }

          animFrameRef.current = requestAnimationFrame(renderLoop);
          return;
        }

        if (phase === "reveal") {
          const progress = Math.min(1, elapsed / REVEAL_DURATION);

          ctx.clearRect(0, 0, width, height);

          // Cells shrink / wipe out
          for (let i = 0; i < cells.length; i++) {
            const cell = cells[i];
            const localP = Math.max(0, Math.min(1, (progress - cell.delay) / 0.35));
            const scale = 1 - easeOutCubic(localP);
            if (scale <= 0) continue;

            const w = cell.w * scale;
            const h = cell.h * scale;
            const x = cell.x + (cell.w - w) / 2;
            const y = cell.y + (cell.h - h) / 2;

            ctx.fillStyle = cell.color;
            ctx.fillRect(Math.floor(x), Math.floor(y), Math.ceil(w), Math.ceil(h));

            if (scale > 0.15 && scale < 0.95) {
              ctx.strokeStyle = cell.accent
                ? "rgba(52, 183, 221, 0.35)"
                : "rgba(22, 59, 68, 0.45)";
              ctx.lineWidth = 1;
              ctx.strokeRect(
                Math.floor(x) + 0.5,
                Math.floor(y) + 0.5,
                Math.ceil(w) - 1,
                Math.ceil(h) - 1,
              );
            }
          }

          if (progress >= 1) {
            ctx.clearRect(0, 0, width, height);
            canvas.style.pointerEvents = "none";
            isTransitioningRef.current = false;
            return;
          }

          animFrameRef.current = requestAnimationFrame(renderLoop);
        }
      };

      animFrameRef.current = requestAnimationFrame(renderLoop);
    },
    [buildGrid, router],
  );

  // Global link interception for clean, universal page transitions
  useEffect(() => {
    const handleGlobalClick = (e: MouseEvent) => {
      // Disregard if already transitioning
      if (isTransitioningRef.current) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }

      const target = e.target as HTMLElement | null;
      if (!target) return;

      const anchor = target.closest("a");
      if (!anchor) return;

      // Ignore external tabs, downloads, or modifier keys
      if (
        anchor.target === "_blank" ||
        anchor.hasAttribute("download") ||
        e.metaKey ||
        e.ctrlKey ||
        e.shiftKey ||
        e.altKey ||
        e.button !== 0
      ) {
        return;
      }

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      ) {
        return;
      }

      try {
        const targetUrl = new URL(href, window.location.href);

        // Disregard external domains
        if (targetUrl.origin !== window.location.origin) {
          return;
        }

        // Disregard navigation to exact same page URL
        if (
          targetUrl.pathname === window.location.pathname &&
          targetUrl.search === window.location.search &&
          targetUrl.hash === window.location.hash
        ) {
          return;
        }

        // Trigger the pixel curtain transition
        e.preventDefault();
        e.stopPropagation();

        const dest = targetUrl.pathname + targetUrl.search + targetUrl.hash;
        runTransition(dest, e.clientX, e.clientY);
      } catch {
        // Fallback default navigation if URL parsing fails
      }
    };

    document.addEventListener("click", handleGlobalClick, { capture: true });

    return () => {
      document.removeEventListener("click", handleGlobalClick, { capture: true });
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [runTransition]);

  // Context value exposed for programmatic navigation
  const contextValue = useMemo(
    () => ({
      navigate: (href: string, originX?: number, originY?: number) => {
        runTransition(href, originX, originY);
      },
    }),
    [runTransition],
  );

  return (
    <PixelTransitionContext.Provider value={contextValue}>
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[9999] h-screen w-screen select-none"
      />
    </PixelTransitionContext.Provider>
  );
}

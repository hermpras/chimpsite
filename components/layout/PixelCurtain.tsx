"use client";

import React, {
  useEffect,
  useState,
  createContext,
  useContext,
  useMemo,
  useTransition,
} from "react";
import { useRouter, usePathname } from "next/navigation";

interface PixelTransitionContextValue {
  navigate: (href: string) => void;
}

const PixelTransitionContext = createContext<PixelTransitionContextValue>({
  navigate: () => {},
});

export function usePixelTransition() {
  return useContext(PixelTransitionContext);
}

/**
 * Optimized Page Transition Provider:
 * - Employs native Next.js instant soft navigation without blocking link clicks or freezing the main thread.
 * - Displays a sleek, luxury Elysium cyan top progress laser beam during route transitions.
 * - Prevents thread locking and eliminates the 720ms artificial delay previously caused by full-screen canvas block rendering.
 */
export function PixelCurtain() {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();
  const [isNavigating, setIsNavigating] = useState(false);

  // Reset navigation indicator on route change
  useEffect(() => {
    setIsNavigating(false);
  }, [pathname]);

  // Context value exposed for programmatic navigation
  const contextValue = useMemo(
    () => ({
      navigate: (href: string) => {
        setIsNavigating(true);
        startTransition(() => {
          router.push(href);
        });
      },
    }),
    [router],
  );

  const active = isNavigating || isPending;

  return (
    <PixelTransitionContext.Provider value={contextValue}>
      {/* Top Luminous Elysium Laser Beam (Active only during route transitions) */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed top-0 left-0 right-0 z-[9999] h-[2px] overflow-hidden transition-opacity duration-300 ${
          active ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className={`h-full w-full bg-gradient-to-r from-transparent via-[#34B7DD] to-amber-300 shadow-[0_0_12px_#34B7DD] ${
            active ? "animate-elysium-laser" : ""
          }`}
        />
      </div>
    </PixelTransitionContext.Provider>
  );
}

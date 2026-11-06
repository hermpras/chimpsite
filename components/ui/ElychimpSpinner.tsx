import React from "react";
import { cn } from "@/lib/utils";

interface ElychimpSpinnerProps {
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
  speed?: "normal" | "fast" | "slow";
}

const SIZE_MAP = {
  xs: "h-3.5 w-3.5",
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-14 w-14",
  xl: "h-20 w-20",
};

const SPEED_MAP = {
  normal: "animate-spin",
  fast: "animate-[spin_0.6s_linear_infinite]",
  slow: "animate-[spin_2s_linear_infinite]",
};

export function ElychimpSpinner({
  size = "md",
  speed = "normal",
  className,
}: ElychimpSpinnerProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/images/elychimp-spinner.png"
      alt="Loading..."
      className={cn(
        "object-contain select-none pointer-events-none shrink-0 inline-block",
        SIZE_MAP[size],
        SPEED_MAP[speed],
        className
      )}
    />
  );
}

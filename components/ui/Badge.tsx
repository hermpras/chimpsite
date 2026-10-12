import React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "warning" | "success" | "outline";
}

export function Badge({
  children,
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-300 border-amber-500/20",
    success: "bg-teal-500/10 text-teal-300 border-teal-500/20",
    outline: "bg-transparent text-gray-300 border-gray-700",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

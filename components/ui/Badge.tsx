import React from "react";
import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "warning" | "success" | "outline" | "cyan" | "gold" | "danger";
}

export function Badge({
  children,
  variant = "default",
  className,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: "bg-[#34B7DD]/10 text-[#6FCDE8] border-[#34B7DD]/30",
    cyan: "bg-[#34B7DD]/10 text-[#6FCDE8] border-[#34B7DD]/30",
    warning: "bg-[#F59E0B]/10 text-[#FBBF24] border-[#F59E0B]/30",
    gold: "bg-[#F59E0B]/10 text-[#FBBF24] border-[#F59E0B]/30",
    success: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30",
    outline: "bg-transparent text-[#8AA8B2] border-[#163B44]",
    danger: "bg-rose-500/10 text-rose-300 border-rose-500/30",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
        variantStyles[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "gold";
  size?: "sm" | "md" | "lg";
}

export function Button({
  children,
  variant = "primary",
  size = "md",
  className,
  disabled,
  ...props
}: ButtonProps) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-[#34B7DD]/50 disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variantStyles = {
    primary:
      "bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] active:bg-[#2D7388] font-semibold shadow-[0_0_20px_rgba(52,183,221,0.2)] hover:shadow-[0_0_25px_rgba(52,183,221,0.35)]",
    gold:
      "bg-[#F59E0B] text-[#04181C] hover:bg-[#FBBF24] active:bg-[#D97706] font-semibold shadow-[0_0_20px_rgba(245,158,11,0.2)] hover:shadow-[0_0_25px_rgba(245,158,11,0.35)]",
    secondary:
      "bg-[#102B33] text-[#DBF2F9] border border-[#1E4D5A] hover:bg-[#163B44] hover:border-[#34B7DD]/60 hover:text-white active:bg-[#0B2026]",
    outline:
      "border border-[#163B44] bg-transparent text-[#DBF2F9] hover:border-[#34B7DD]/60 hover:bg-[#0B2026]/70 hover:text-white active:bg-[#102B33]",
    ghost:
      "bg-transparent text-[#8AA8B2] hover:text-[#DBF2F9] hover:bg-[#102B33]/60",
  };

  return (
    <button
      className={cn(baseStyles, sizeStyles[size], variantStyles[variant], className)}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}

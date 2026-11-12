import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "gold" | "success";
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
    "inline-flex items-center justify-center font-sans font-extrabold uppercase rounded-xl transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-[#34B7DD]/50 disabled:opacity-50 disabled:cursor-not-allowed select-none cursor-pointer";

  const sizeStyles = {
    sm: "px-3.5 py-2 text-xs tracking-[0.14em]",
    md: "px-5 py-2.5 text-xs sm:text-sm tracking-[0.16em]",
    lg: "px-8 py-3.5 sm:py-4 text-xs sm:text-sm tracking-[0.18em]",
  };

  const variantStyles = {
    primary:
      "border border-[#7AE5FF]/80 bg-gradient-to-b from-[#4ED5F8] via-[#34B7DD] to-[#1E97BC] font-black text-[#021418] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.85),0_8px_24px_rgba(52,183,221,0.35)] hover:from-[#72E2FF] hover:via-[#42C8EC] hover:to-[#26A6CC] hover:shadow-[inset_0_1px_2px_rgba(255,255,255,1),0_12px_32px_rgba(52,183,221,0.55)] active:scale-[0.98]",
    gold:
      "border border-yellow-300/80 bg-gradient-to-b from-yellow-300 via-amber-400 to-amber-500 font-black text-[#1C1202] shadow-[inset_0_1px_1.5px_rgba(255,255,255,0.85),0_8px_24px_rgba(245,158,11,0.4)] hover:from-yellow-200 hover:via-amber-300 hover:to-amber-400 hover:shadow-[inset_0_1px_2px_rgba(255,255,255,1),0_12px_32px_rgba(245,158,11,0.6)] active:scale-[0.98]",
    secondary:
      "border border-[#34B7DD]/60 bg-gradient-to-b from-[#0D343F]/95 via-[#07242C]/95 to-[#04191F]/95 font-extrabold text-[#E0F5FA] shadow-[inset_0_1px_1px_rgba(255,255,255,0.35),inset_0_0_24px_rgba(52,183,221,0.12),0_8px_24px_rgba(0,0,0,0.6)] backdrop-blur-2xl hover:border-[#6DE0FF] hover:from-[#134452] hover:via-[#0A2E38] hover:to-[#052129] hover:text-white hover:shadow-[inset_0_1px_2px_rgba(255,255,255,0.65),0_0_32px_rgba(52,183,221,0.45)] active:scale-[0.98]",
    outline:
      "border border-[#34B7DD]/40 bg-[#07242C]/60 text-[#DBF2F9] font-extrabold shadow-[inset_0_1px_1px_rgba(255,255,255,0.1)] hover:border-[#34B7DD]/80 hover:bg-[#0E3A47]/80 hover:text-white active:scale-[0.98]",
    success:
      "border border-emerald-500/60 bg-gradient-to-b from-[#0B382B]/95 via-[#06261D]/95 to-[#031A13]/95 font-extrabold text-emerald-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.3),inset_0_0_24px_rgba(16,185,129,0.15),0_8px_24px_rgba(0,0,0,0.6)] backdrop-blur-2xl hover:border-emerald-400 hover:text-emerald-200 active:scale-[0.98]",
    ghost:
      "bg-transparent text-[#8AA8B2] font-bold hover:text-[#DBF2F9] hover:bg-[#102B33]/60",
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

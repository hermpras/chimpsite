import React from "react";
import { cn } from "@/lib/utils";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
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
    "inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed";

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
  };

  const variantStyles = {
    primary:
      "bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm active:bg-emerald-700",
    secondary: "bg-gray-800 text-gray-100 hover:bg-gray-700 active:bg-gray-900",
    outline:
      "border border-gray-700 bg-transparent text-gray-200 hover:bg-gray-800/60 active:bg-gray-800",
    ghost: "bg-transparent text-gray-300 hover:bg-gray-800/50 text-gray-200",
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

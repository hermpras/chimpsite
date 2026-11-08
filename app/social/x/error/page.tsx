"use client";

import React, { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Link2Off, ShieldAlert } from "lucide-react";
import { XLogo } from "@/components/icons/XLogo";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

interface ErrorInfo {
  tag: string;
  badgeVariant: "danger" | "warning" | "default" | "outline";
  title: string;
  subtitle: string;
  explanation: string;
}

function resolveErrorInfo(errorCode: string | null, rawMessage: string | null): ErrorInfo {
  switch (errorCode) {
    case "X_ACCOUNT_ALREADY_LINKED":
      return {
        tag: "Account Conflict",
        badgeVariant: "danger",
        title: "X ACCOUNT ALREADY LINKED",
        subtitle: "This X (Twitter) profile is already connected to another wallet.",
        explanation:
          "To maintain fair allocations and prevent multi-accounting, each X account can only be linked to a single Elychimp wallet profile.",
      };

    case "X_OAUTH_PROVIDER_ERROR":
    case "access_denied":
      return {
        tag: "Authorization Cancelled",
        badgeVariant: "warning",
        title: "AUTHORIZATION CANCELLED",
        subtitle: "The connection request was denied or cancelled on X.",
        explanation:
          "You declined the permissions request or closed the authorization window. No changes were made to your Elychimp profile.",
      };

    case "OAUTH_STATE_EXPIRED":
      return {
        tag: "Session Expired",
        badgeVariant: "warning",
        title: "CONNECTION TIMED OUT",
        subtitle: "The authorization window remained open too long and has expired.",
        explanation:
          "For your security, OAuth authorization tokens are valid for 10 minutes. Please return to your profile and initiate the link again.",
      };

    case "SESSION_MISMATCH":
      return {
        tag: "Security Check",
        badgeVariant: "danger",
        title: "WALLET SESSION MISMATCH",
        subtitle: "The active wallet session changed during authorization.",
        explanation:
          "The wallet connected when initiating the X link does not match your currently active wallet session. Please reconnect with the original wallet.",
      };

    case "UNAUTHORIZED":
      return {
        tag: "Wallet Required",
        badgeVariant: "warning",
        title: "WALLET NOT CONNECTED",
        subtitle: "A verified wallet session is required to link an X account.",
        explanation:
          "Please connect and authenticate your Web3 wallet before attempting to link social accounts.",
      };

    case "X_OAUTH_NOT_CONFIGURED":
      return {
        tag: "Service Notice",
        badgeVariant: "outline",
        title: "SERVICE UNAVAILABLE",
        subtitle: "X OAuth credentials are not configured in this environment.",
        explanation:
          "The X authentication service is temporarily unavailable. Please check back shortly or notify the team.",
      };

    default:
      return {
        tag: "Connection Error",
        badgeVariant: "danger",
        title: "LINKING FAILED",
        subtitle: rawMessage || "Unable to complete X account verification at this time.",
        explanation:
          "An unexpected error occurred during the OAuth authentication callback. Please try again later.",
      };
  }
}

function XErrorContent() {
  const searchParams = useSearchParams();
  const errorCode = searchParams?.get("error") || null;
  const rawMessage = searchParams?.get("message") || null;

  const info = resolveErrorInfo(errorCode, rawMessage);

  return (
    <div className="relative flex min-h-[80vh] flex-col items-center justify-center overflow-hidden px-4 py-16">
      {/* Ambient Lighting Bleeds */}
      <div className="pointer-events-none absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full bg-rose-500/10 blur-[140px]" />
      <div className="pointer-events-none absolute top-1/2 left-1/3 h-[300px] w-[300px] rounded-full bg-[#34B7DD]/10 blur-[130px]" />
      <div className="pointer-events-none absolute bottom-1/4 right-1/3 h-[240px] w-[240px] rounded-full bg-[#F59E0B]/10 blur-[120px]" />

      <div className="relative z-10 w-full max-w-2xl text-center">
        {/* Top Floating Badge & Icon */}
        <div className="mb-6 flex flex-col items-center justify-center gap-3">
          <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-500/40 bg-rose-950/40 shadow-[0_0_30px_rgba(244,63,94,0.25)] backdrop-blur-md">
            <XLogo className="h-9 w-9 text-white" />
            <div className="absolute -bottom-2 -right-2 flex h-8 w-8 items-center justify-center rounded-full border border-rose-500 bg-[#04181C] text-rose-400 shadow-md">
              <Link2Off className="h-4 w-4" />
            </div>
          </div>

          <div className="inline-flex items-center gap-2">
            <Badge variant={info.badgeVariant} className="px-3 py-1 uppercase tracking-wider text-xs">
              <ShieldAlert className="mr-1.5 h-3.5 w-3.5" />
              {info.tag}
            </Badge>
          </div>
        </div>

        {/* Headline */}
        <h1 className="font-display text-4xl sm:text-6xl uppercase tracking-tighter text-[#F8F7F4] leading-[0.95] drop-shadow-[0_4px_24px_rgba(0,0,0,0.85)]">
          {info.title}
        </h1>

        <p className="mt-4 text-base sm:text-lg font-medium text-[#6FCDE8]">
          {info.subtitle}
        </p>

        <p className="mt-2 text-sm sm:text-base text-[#8AA8B2] max-w-lg mx-auto leading-relaxed">
          {info.explanation}
        </p>

        {/* Navigation Action Button */}
        <div className="mt-10 flex items-center justify-center">
          <Link href="/" className="w-full sm:w-auto">
            <Button
              size="lg"
              className="w-full sm:w-auto gap-2.5 bg-[#34B7DD] text-[#04181C] hover:bg-[#6FCDE8] font-bold text-sm sm:text-base uppercase tracking-wider shadow-[0_0_20px_rgba(52,183,221,0.25)] px-8 py-4"
            >
              <ArrowLeft className="h-4 w-4" />
              Return to Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function XErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[70vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#34B7DD] border-t-transparent" />
        </div>
      }
    >
      <XErrorContent />
    </Suspense>
  );
}

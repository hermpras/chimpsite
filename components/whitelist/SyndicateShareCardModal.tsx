"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";
import {
  X,
  Download,
  ExternalLink,
  Sparkles,
  CheckCircle2,
  Copy,
  Check,
  ShieldCheck,
} from "lucide-react";
import { XLogo } from "@/components/icons/XLogo";
import { Button } from "@/components/ui/Button";
import { shortenAddress } from "@/lib/auth/address";

export interface SyndicateShareCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  slotNumber?: number;
  queueNumber?: number;
  phase?: "SLOT_ALLOCATED" | "FCFS_REGISTERED" | string;
  isFullyQualified?: boolean;
  address?: string;
  xUsername?: string;
  xName?: string;
  avatarUrl?: string;
  heldCategoriesCount?: number;
  allocatedAt?: string;
}

export function SyndicateShareCardModal({
  isOpen,
  onClose,
  slotNumber,
  queueNumber,
  phase = "SLOT_ALLOCATED",
  isFullyQualified = true,
  address,
  xUsername,
  xName,
  avatarUrl,
  heldCategoriesCount = 5,
  allocatedAt,
}: SyndicateShareCardModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isGtd = phase === "SLOT_ALLOCATED";
  const num = isGtd ? slotNumber : queueNumber;
  const paddedNum = num ? String(num).padStart(4, "0") : "0001";
  const displayName = xName || (xUsername ? `@${xUsername}` : address ? shortenAddress(address) : "Syndicate Member");

  const formattedDate = allocatedAt
    ? new Date(allocatedAt).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : new Date().toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });

  const tweetText = isGtd
    ? `Just secured Guaranteed Whitelist Slot #${slotNumber || 1} in the @Elychimp Syndicate! 🐒🔥\n\n5/5 Outfit Fit assembled on @Enter_elysium (Hyperliquid L2).\n\nRule the streets:`
    : `Registered in the @Elychimp FCFS Whitelist Directory #${queueNumber || 1}! 🐒💨 Assembled 5/5 traits on @Enter_elysium (Hyperliquid L2).\n\nRule the streets:`;

  const shareUrl = typeof window !== "undefined" ? window.location.origin : "https://elychimp.xyz";
  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(shareUrl)}`;

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Generate high-resolution canvas card for download
  const handleDownloadCard = useCallback(async () => {
    setIsGenerating(true);
    try {
      const width = 800;
      const height = 1100;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");

      // 1. Dark background with subtle gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, isGtd ? "#181308" : "#081418");
      bgGrad.addColorStop(0.5, "#0b0c13");
      bgGrad.addColorStop(1, "#050608");
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Subtle cybernetic grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      for (let x = 40; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 40; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // 2. Brutalist Borders
      const primaryColor = isGtd ? "#f59e0b" : "#06b6d4";
      const primaryGlow = isGtd ? "rgba(245, 158, 11, 0.3)" : "rgba(6, 182, 212, 0.3)";

      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 4;
      ctx.strokeRect(30, 30, width - 60, height - 60);

      // Inner thin border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.strokeRect(40, 40, width - 80, height - 80);

      // Corner tech brackets
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 5;
      const bracketLen = 24;
      // Top-left
      ctx.beginPath();
      ctx.moveTo(25, 25 + bracketLen);
      ctx.lineTo(25, 25);
      ctx.lineTo(25 + bracketLen, 25);
      ctx.stroke();
      // Top-right
      ctx.beginPath();
      ctx.moveTo(width - 25 - bracketLen, 25);
      ctx.lineTo(width - 25, 25);
      ctx.lineTo(width - 25, 25 + bracketLen);
      ctx.stroke();
      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(25, height - 25 - bracketLen);
      ctx.lineTo(25, height - 25);
      ctx.lineTo(25 + bracketLen, height - 25);
      ctx.stroke();
      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(width - 25 - bracketLen, height - 25);
      ctx.lineTo(width - 25, height - 25);
      ctx.lineTo(width - 25, height - 25 - bracketLen);
      ctx.stroke();

      // 3. Header Text & Logo
      ctx.fillStyle = primaryColor;
      ctx.font = "bold 14px 'Space Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText(isGtd ? "ELYCHIMP SYNDICATE • GUARANTEED ALLOCATION" : "ELYCHIMP SYNDICATE • FCFS DIRECTORY", 60, 80);

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 36px 'Anton', impact, sans-serif";
      ctx.fillText(isGtd ? "GTD MINTER PASS" : "FCFS CLEARANCE PASS", 60, 125);

      // Load and draw Elychimp Brand Logo on Right (replacing slot #)
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      logoImg.src = "/images/elychimp-logo.png";
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
      });

      if (logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
        const logoHeight = 58;
        const logoWidth = logoHeight * (logoImg.naturalWidth / logoImg.naturalHeight);
        const logoX = width - 60 - logoWidth;
        const logoY = 70;
        ctx.drawImage(logoImg, logoX, logoY, logoWidth, logoHeight);
      }

      // Header divider line
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(60, 150);
      ctx.lineTo(width - 60, 150);
      ctx.stroke();

      // 4. Hero Avatar Frame
      const avatarBoxSize = 420;
      const avatarBoxX = (width - avatarBoxSize) / 2;
      const avatarBoxY = 175;

      // Outer glow for avatar
      ctx.fillStyle = primaryGlow;
      ctx.fillRect(avatarBoxX - 6, avatarBoxY - 6, avatarBoxSize + 12, avatarBoxSize + 12);

      // Avatar box background
      ctx.fillStyle = "#0c0e17";
      ctx.fillRect(avatarBoxX, avatarBoxY, avatarBoxSize, avatarBoxSize);
      ctx.strokeStyle = primaryColor;
      ctx.lineWidth = 3;
      ctx.strokeRect(avatarBoxX, avatarBoxY, avatarBoxSize, avatarBoxSize);

      // Load Avatar image
      const resolvedAvatarSrc = avatarUrl || (address ? `/api/renders/avatar/${encodeURIComponent(address)}` : "/images/chimp-base-bw.png");
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = resolvedAvatarSrc;

      await new Promise<void>((resolve) => {
        img.onload = () => resolve();
        img.onerror = () => {
          // fallback to base image
          img.src = "/images/chimp-base-bw.png";
          img.onload = () => resolve();
          img.onerror = () => resolve();
        };
      });

      // Draw avatar with crisp pixel-art interpolation
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, avatarBoxX + 10, avatarBoxY + 10, avatarBoxSize - 20, avatarBoxSize - 20);
      ctx.imageSmoothingEnabled = true;

      // 5. User Identity Strip Under Avatar
      const userBoxY = avatarBoxY + avatarBoxSize + 25;

      ctx.textAlign = "left";
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 32px 'Anton', impact, sans-serif";
      ctx.fillText(displayName.toUpperCase(), 60, userBoxY + 25);

      if (xUsername) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
        ctx.font = "14px 'Space Mono', monospace";
        ctx.fillText(`@${xUsername} on X`, 60, userBoxY + 52);
      }

      // Verified Status Ribbon on Right
      ctx.textAlign = "right";
      ctx.fillStyle = isGtd ? "#34d399" : "#38bdf8";
      ctx.font = "bold 14px 'Space Mono', monospace";
      ctx.fillText(isGtd ? "★ GTD MINT ALLOCATED" : "★ FCFS REGISTERED", width - 60, userBoxY + 25);

      ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
      ctx.font = "12px 'Space Mono', monospace";
      ctx.fillText(`Secured on ${formattedDate}`, width - 60, userBoxY + 50);

      // 6. Telemetry Specs Grid
      const gridY = userBoxY + 75;
      const gridHeight = 110;
      ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
      ctx.fillRect(60, gridY, width - 120, gridHeight);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      ctx.strokeRect(60, gridY, width - 120, gridHeight);

      // Spec items
      const colWidth = (width - 120) / 3;
      const specs = [
        { label: "MINT STAGE", val: isGtd ? "PHASE 1 (GTD)" : "PHASE 2 (FCFS)", color: primaryColor },
        { label: "ALLOCATION", val: "1x GENESIS CHIMP", color: "#ffffff" },
        { label: "NETWORK", val: "HYPERLIQUID L2", color: "#34d399" },
        { label: "WALLET", val: address ? shortenAddress(address) : "VERIFIED", color: "#ffffff" },
        { label: "TRAIT FIT", val: `${heldCategoriesCount}/5 ASSEMBLED`, color: primaryColor },
        { label: "STATUS", val: "LOCKED & ACTIVE", color: "#34d399" },
      ];

      specs.forEach((s, idx) => {
        const c = idx % 3;
        const r = Math.floor(idx / 3);
        const xPos = 60 + c * colWidth + 15;
        const yPos = gridY + (r === 0 ? 32 : 82);

        ctx.textAlign = "left";
        ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
        ctx.font = "10px 'Space Mono', monospace";
        ctx.fillText(s.label, xPos, yPos - 14);

        ctx.fillStyle = s.color;
        ctx.font = "bold 13px 'Space Mono', monospace";
        ctx.fillText(s.val, xPos, yPos + 4);
      });

      // 7. Security Barcode & Stamp Footer
      const footerY = height - 90;
      ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
      ctx.beginPath();
      ctx.moveTo(60, footerY);
      ctx.lineTo(width - 60, footerY);
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
      ctx.font = "14px 'Space Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("||| | |||| | |||||| || | |||| ||| |||||||", 60, footerY + 35);

      ctx.textAlign = "right";
      ctx.font = "bold 12px 'Space Mono', monospace";
      ctx.fillStyle = primaryColor;
      ctx.fillText(`SERIAL: ELY-${isGtd ? "GTD" : "FCFS"}-${paddedNum}-HYPERL2`, width - 60, footerY + 35);

      // 8. Trigger File Download
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.download = `elychimp-${isGtd ? "gtd" : "fcfs"}-pass-${paddedNum}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Card download failed:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [isGtd, slotNumber, queueNumber, paddedNum, displayName, xUsername, address, avatarUrl, heldCategoriesCount, formattedDate]);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    });
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-card-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div className="relative my-auto w-full max-w-lg rounded-2xl border border-zinc-800 bg-[#0c0d15] p-5 sm:p-6 shadow-2xl space-y-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1 pr-8">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="font-mono-street text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              COLLECTIBLE MINT PASS
            </span>
          </div>
          <h3 id="share-card-title" className="font-display text-xl uppercase tracking-wider text-white">
            Syndicate Whitelist Card
          </h3>
          <p className="text-xs text-zinc-400 font-mono-street">
            Your assembled avatar and confirmed whitelist standing ready to download and share.
          </p>
        </div>

        {/* Interactive Trading Card Preview */}
        <div
          className={`relative overflow-hidden rounded-2xl border-2 p-5 ${
            isGtd
              ? "border-amber-400/80 bg-gradient-to-b from-[#181308] via-[#0f0c06] to-[#070604] shadow-[0_0_35px_rgba(245,158,11,0.25)]"
              : "border-cyan-400/80 bg-gradient-to-b from-[#0a1418] via-[#060d10] to-[#04080a] shadow-[0_0_35px_rgba(6,182,212,0.25)]"
          }`}
        >
          {/* Corner Tech Brackets */}
          <div className={`pointer-events-none absolute top-2 left-2 h-3 w-3 border-t-2 border-l-2 ${isGtd ? "border-amber-400/70" : "border-cyan-400/70"}`} />
          <div className={`pointer-events-none absolute top-2 right-2 h-3 w-3 border-t-2 border-r-2 ${isGtd ? "border-amber-400/70" : "border-cyan-400/70"}`} />
          <div className={`pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b-2 border-l-2 ${isGtd ? "border-amber-400/70" : "border-cyan-400/70"}`} />
          <div className={`pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b-2 border-r-2 ${isGtd ? "border-amber-400/70" : "border-cyan-400/70"}`} />

          {/* Card Top Strip */}
          <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
            <div>
              <span className={`font-mono-street text-[10px] font-bold uppercase tracking-widest ${isGtd ? "text-amber-400" : "text-cyan-400"}`}>
                ELYCHIMP SYNDICATE
              </span>
              <p className="font-display text-lg sm:text-xl uppercase tracking-wider text-white">
                {isGtd ? "GTD Minter Pass" : "FCFS Clearance Pass"}
              </p>
            </div>
            {/* Brand Logo replacing Slot # */}
            <div className="flex items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/elychimp-logo.png"
                alt="Elychimp Logo"
                className="h-8 sm:h-9 w-auto object-contain drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)]"
              />
            </div>
          </div>

          {/* Avatar Hero Frame */}
          <div className="my-4 flex flex-col items-center justify-center">
            <div
              className={`relative overflow-hidden rounded-2xl border-2 p-2 ${
                isGtd
                  ? "border-amber-400/50 bg-[#0c0e17] shadow-[0_0_20px_rgba(245,158,11,0.2)]"
                  : "border-cyan-400/50 bg-[#0c0e17] shadow-[0_0_20px_rgba(6,182,212,0.2)]"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl || (address ? `/api/renders/avatar/${encodeURIComponent(address)}` : "/images/chimp-base-bw.png")}
                alt="Elychimp Assembled Avatar"
                className="h-44 w-44 sm:h-52 sm:w-52 object-contain [image-rendering:pixelated]"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = "/images/chimp-base-bw.png";
                }}
              />
            </div>
          </div>

          {/* User Info Strip */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 pb-3">
            <div>
              <h4 className="font-display text-xl uppercase tracking-wider text-white">
                {displayName}
              </h4>
              <p className="font-mono-street text-[11px] text-zinc-400">
                {address ? shortenAddress(address) : "Verified EVM"}
                {xUsername && <span className="ml-2 text-cyan-400">@{xUsername}</span>}
              </p>
            </div>
            <div className="text-right">
              <span className={`font-mono-street text-xs font-bold uppercase tracking-wider ${isGtd ? "text-emerald-400" : "text-cyan-400"}`}>
                {isGtd ? "★ Guaranteed" : "★ FCFS Ready"}
              </span>
              <p className="font-mono-street text-[10px] text-zinc-500">
                {heldCategoriesCount}/5 Traits Assembled
              </p>
            </div>
          </div>

          {/* Micro Telemetry Footer */}
          <div className="flex items-center justify-between pt-3 font-mono-street text-[10px] text-zinc-500">
            <span className="tracking-widest select-none">||| | |||| | |||||| || | |||| |||</span>
            <span>SERIAL: ELY-{isGtd ? "GTD" : "FCFS"}-{paddedNum}</span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2.5 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Button
              onClick={handleDownloadCard}
              disabled={isGenerating}
              variant="primary"
              size="lg"
              className={`w-full gap-2 rounded-xl font-mono-street font-bold text-xs uppercase tracking-wider py-3.5 shadow-brutal-sm cursor-pointer transition-all ${
                isGtd
                  ? "bg-amber-400 hover:bg-amber-300 text-black"
                  : "bg-cyan-400 hover:bg-cyan-300 text-black"
              }`}
            >
              <Download className="h-4 w-4" />
              <span>{isGenerating ? "Generating PNG..." : "Download Card (PNG)"}</span>
            </Button>

            <a
              href={tweetHref}
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full"
            >
              <Button
                variant="outline"
                size="lg"
                className="w-full gap-2 rounded-xl border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-white font-mono-street font-bold text-xs uppercase tracking-wider py-3.5 shadow-brutal-sm cursor-pointer"
              >
                <XLogo className="h-4 w-4 fill-white" />
                <span>Share on X</span>
                <ExternalLink className="h-3.5 w-3.5 ml-0.5 text-zinc-400" />
              </Button>
            </a>
          </div>

          <button
            onClick={handleCopyLink}
            className="w-full py-2 text-center text-xs font-mono-street text-zinc-400 hover:text-white flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Link Copied to Clipboard!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copy Shareable Link</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

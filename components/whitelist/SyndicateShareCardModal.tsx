"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  X,
  Download,
  ExternalLink,
  Sparkles,
  Copy,
  Check,
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

// Banana Die-Cut Sticker for HTML Preview
function BananaSticker({
  className = "",
  style = {},
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`pointer-events-none select-none filter drop-shadow-[0_4px_10px_rgba(0,0,0,0.28)] ${className}`}
    >
      <svg
        viewBox="0 0 120 54"
        className="w-full h-full overflow-visible"
        aria-hidden="true"
      >
        {/* Die-cut white border */}
        <path
          d="M 14 36 C 36 58, 86 54, 108 20 C 90 8, 38 12, 14 36 Z"
          fill="#ffffff"
          stroke="#ffffff"
          strokeWidth="7"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Yellow Banana Body */}
        <path
          d="M 15 36 C 36 56, 84 52, 106 20 C 88 11, 40 14, 15 36 Z"
          fill="#facc15"
        />
        {/* Lighter yellow ridge */}
        <path
          d="M 22 34 C 40 46, 80 43, 98 22 C 84 16, 44 17, 22 34 Z"
          fill="#fef08a"
        />
        {/* Green Stem */}
        <path d="M 15 36 L 6 41 L 8 45 L 17 40 Z" fill="#65a30d" />
        {/* Brown Tip */}
        <path d="M 106 20 L 112 18 L 110 23 Z" fill="#713f12" />
        {/* Highlight sheen */}
        <path
          d="M 32 29 C 48 38, 70 37, 88 23"
          fill="none"
          stroke="rgba(255,255,255,0.7)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
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

  const isGtd = phase === "SLOT_ALLOCATED";
  const num = isGtd ? slotNumber : queueNumber;
  const paddedNum = num ? String(num).padStart(4, "0") : "0001";
  const displayName =
    xName ||
    (xUsername
      ? `@${xUsername}`
      : address
        ? shortenAddress(address)
        : "Syndicate Member");

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
    ? `Verified by the @Elychimp Syndicate! 🐒🔥\n\nOfficial Clearance Pass secured on @Enter_elysium (Hyperliquid L2).\n\nRule the streets:`
    : `Registered with the @Elychimp Syndicate! 🐒💨 Verified clearance on @Enter_elysium (Hyperliquid L2).\n\nRule the streets:`;

  const shareUrl =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://elychimp.xyz";
  const tweetHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    tweetText
  )}&url=${encodeURIComponent(shareUrl)}`;

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Helper function to draw rounded rectangle
  const drawRoundRect = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ) => {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  // Helper to draw realistic banana sticker on canvas
  const drawCanvasBanana = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale: number,
    angleDeg: number
  ) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((angleDeg * Math.PI) / 180);
    ctx.scale(scale, scale);

    // Die-cut white border
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 5;

    ctx.beginPath();
    ctx.lineWidth = 14;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#ffffff";
    ctx.fillStyle = "#ffffff";
    ctx.moveTo(-50, 16);
    ctx.bezierCurveTo(-28, 48, 32, 45, 58, 4);
    ctx.bezierCurveTo(40, -10, -18, -8, -50, 16);
    ctx.fill();
    ctx.stroke();

    ctx.shadowColor = "transparent";

    // Yellow Banana Body
    ctx.beginPath();
    ctx.fillStyle = "#facc15";
    ctx.moveTo(-48, 16);
    ctx.bezierCurveTo(-26, 44, 30, 42, 54, 4);
    ctx.bezierCurveTo(36, -6, -16, -5, -48, 16);
    ctx.fill();

    // Lighter Yellow Ridge
    ctx.beginPath();
    ctx.fillStyle = "#fef08a";
    ctx.moveTo(-40, 14);
    ctx.bezierCurveTo(-20, 30, 24, 28, 48, 5);
    ctx.bezierCurveTo(34, 0, -12, 0, -40, 14);
    ctx.fill();

    // Green Stem
    ctx.beginPath();
    ctx.fillStyle = "#65a30d";
    ctx.moveTo(-48, 16);
    ctx.lineTo(-58, 22);
    ctx.lineTo(-56, 28);
    ctx.lineTo(-45, 21);
    ctx.closePath();
    ctx.fill();

    // Brown Tip
    ctx.beginPath();
    ctx.fillStyle = "#713f12";
    ctx.moveTo(54, 4);
    ctx.lineTo(60, 2);
    ctx.lineTo(58, 7);
    ctx.closePath();
    ctx.fill();

    // Highlight Sheen
    ctx.beginPath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.moveTo(-32, 9);
    ctx.bezierCurveTo(-10, 20, 16, 20, 38, 4);
    ctx.stroke();

    ctx.restore();
  };

  // Generate 1200x675 px Twitter in-feed optimal card
  const handleDownloadCard = useCallback(async () => {
    setIsGenerating(true);
    try {
      const width = 1200;
      const height = 675;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas context not available");

      // 1. Soft pastel lavender/slate background (matching reference image)
      const outerGrad = ctx.createLinearGradient(0, 0, width, height);
      outerGrad.addColorStop(0, "#a5a9c9");
      outerGrad.addColorStop(1, "#bcc0dc");
      ctx.fillStyle = outerGrad;
      ctx.fillRect(0, 0, width, height);

      // 2. Plastic Badge Lanyard Sleeve Holder
      const sleeveX = 60;
      const sleeveY = 25;
      const sleeveW = 1080;
      const sleeveH = 625;
      const sleeveR = 26;

      // Soft shadow under plastic sleeve
      ctx.save();
      ctx.shadowColor = "rgba(0, 0, 0, 0.22)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 12;

      // Sleeve background (translucent frosted acrylic)
      ctx.fillStyle = "rgba(235, 238, 250, 0.55)";
      drawRoundRect(ctx, sleeveX, sleeveY, sleeveW, sleeveH, sleeveR);
      ctx.fill();
      ctx.restore();

      // Sleeve outer double border
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 3.5;
      drawRoundRect(ctx, sleeveX, sleeveY, sleeveW, sleeveH, sleeveR);
      ctx.stroke();

      ctx.strokeStyle = "rgba(100, 105, 135, 0.25)";
      ctx.lineWidth = 1;
      drawRoundRect(ctx, sleeveX + 3, sleeveY + 3, sleeveW - 6, sleeveH - 6, sleeveR - 2);
      ctx.stroke();

      // Top Lanyard Punch Slot Hole
      const slotW = 130;
      const slotH = 18;
      const slotX = (width - slotW) / 2;
      const slotY = sleeveY + 16;
      ctx.fillStyle = "#7b809d";
      drawRoundRect(ctx, slotX, slotY, slotW, slotH, 9);
      ctx.fill();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.75)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // 3. Inner Card (White Paper Badge)
      const cardX = sleeveX + 24;
      const cardY = sleeveY + 48;
      const cardW = sleeveW - 48;
      const cardH = sleeveH - 72;
      const cardR = 14;

      ctx.save();
      // Card shadow inside holder
      ctx.shadowColor = "rgba(0, 0, 0, 0.12)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 3;
      ctx.fillStyle = "#fafafd";
      drawRoundRect(ctx, cardX, cardY, cardW, cardH, cardR);
      ctx.fill();
      ctx.restore();

      ctx.strokeStyle = "rgba(0, 0, 0, 0.08)";
      ctx.lineWidth = 1;
      drawRoundRect(ctx, cardX, cardY, cardW, cardH, cardR);
      ctx.stroke();

      // Clip inside card for header & layout
      ctx.save();
      drawRoundRect(ctx, cardX, cardY, cardW, cardH, cardR);
      ctx.clip();

      // 4. Card Header: Deep Syndicate Green Band (matching reference Department banner)
      const headerH = 88;
      ctx.fillStyle = "#16452d"; // rich forest syndicate green
      ctx.fillRect(cardX, cardY, cardW, headerH);

      // Header Bottom Accent Line
      ctx.fillStyle = "#2d704c";
      ctx.fillRect(cardX, cardY + headerH - 3, cardW, 3);

      // Logo on Header Left
      const logoImg = new Image();
      logoImg.crossOrigin = "anonymous";
      logoImg.src = "/images/elychimp-logo.png";
      await new Promise<void>((resolve) => {
        logoImg.onload = () => resolve();
        logoImg.onerror = () => resolve();
      });

      if (logoImg.naturalWidth > 0 && logoImg.naturalHeight > 0) {
        const lh = 52;
        const lw = lh * (logoImg.naturalWidth / logoImg.naturalHeight);
        ctx.drawImage(logoImg, cardX + 22, cardY + 18, lw, lh);
      }

      // Organization Header Text
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 24px 'Anton', impact, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("ELYCHIMP SYNDICATE", cardX + 115, cardY + 43);

      ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.fillText("OFFICIAL SYNDICATE ID BADGE", cardX + 115, cardY + 65);

      // Washi Tape on Right with CASE NO. (angled scotch tape)
      ctx.save();
      const tapeX = cardX + cardW - 170;
      const tapeY = cardY + 20;
      ctx.translate(tapeX, tapeY);
      ctx.rotate((-2.5 * Math.PI) / 180);

      ctx.fillStyle = "rgba(110, 231, 183, 0.85)"; // semi-transparent neon green tape
      ctx.fillRect(0, 0, 145, 48);

      ctx.strokeStyle = "rgba(52, 211, 153, 0.6)";
      ctx.lineWidth = 1;
      ctx.strokeRect(0, 0, 145, 48);

      ctx.fillStyle = "#064e3b";
      ctx.font = "bold 9px 'Space Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("SLOT NO.", 12, 18);

      ctx.font = "900 18px 'Space Mono', monospace";
      ctx.fillText(`#${paddedNum}`, 12, 38);
      ctx.restore();

      // 5. Left: Character Photo ID Box
      const photoX = cardX + 34;
      const photoY = cardY + headerH + 24;
      const photoSize = 250;

      // Photo frame shadow & white polaroid border
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
      ctx.shadowBlur = 10;
      ctx.shadowOffsetY = 4;
      ctx.fillRect(photoX, photoY, photoSize, photoSize);
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
      ctx.lineWidth = 1;
      ctx.strokeRect(photoX, photoY, photoSize, photoSize);

      // Load Character Avatar Image
      const resolvedAvatarSrc =
        avatarUrl ||
        (address
          ? `/api/renders/avatar/${encodeURIComponent(address)}`
          : "/images/chimp-base-bw.png");
      const avatarImg = new Image();
      avatarImg.crossOrigin = "anonymous";
      avatarImg.src = resolvedAvatarSrc;

      await new Promise<void>((resolve) => {
        avatarImg.onload = () => resolve();
        avatarImg.onerror = () => {
          avatarImg.src = "/images/chimp-base-bw.png";
          avatarImg.onload = () => resolve();
          avatarImg.onerror = () => resolve();
        };
      });

      // Draw avatar with crisp pixel-art interpolation
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        avatarImg,
        photoX + 8,
        photoY + 8,
        photoSize - 16,
        photoSize - 16
      );
      ctx.imageSmoothingEnabled = true;

      // Dark Navy/Black Status Pill under photo (like "VISITOR" in reference)
      const pillW = photoSize;
      const pillH = 38;
      const pillY = photoY + photoSize + 12;

      ctx.fillStyle = "#111827"; // deep slate/black
      drawRoundRect(ctx, photoX, pillY, pillW, pillH, 8);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "900 16px 'Anton', impact, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        isGtd ? "GUARANTEED MINTER" : "FCFS VISITOR",
        photoX + pillW / 2,
        pillY + 24
      );

      // Red Rubber Stamp Overlaid on Photo (like reference!)
      ctx.save();
      const stampX = photoX + 105;
      const stampY = photoY + photoSize - 20;
      ctx.translate(stampX, stampY);
      ctx.rotate((-12 * Math.PI) / 180);

      ctx.strokeStyle = "rgba(220, 38, 38, 0.85)";
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(0, 0, 68, 0, Math.PI * 2);
      ctx.stroke();

      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 61, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = "rgba(220, 38, 38, 0.88)";
      ctx.font = "bold 9px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("★ ELYCHIMP SYNDICATE ★", 0, -22);

      ctx.font = "900 18px 'Anton', impact, sans-serif";
      ctx.fillText(isGtd ? "GUARANTEED" : "REGISTERED", 0, 5);

      ctx.font = "bold 8px 'Space Mono', monospace";
      ctx.fillText("OFFICIAL CLEARANCE", 0, 26);
      ctx.restore();

      // 6. Right Identity Fields Area
      const infoX = cardX + 325;
      let fieldY = cardY + headerH + 28;

      // NAME
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.textAlign = "left";
      ctx.fillText("NAME", infoX, fieldY);

      ctx.fillStyle = "#111827";
      ctx.font = "900 28px 'Anton', impact, sans-serif";
      ctx.fillText(displayName.toUpperCase(), infoX, fieldY + 28);

      fieldY += 58;

      // ACCOUNT (X)
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.fillText("ACCOUNT", infoX, fieldY);

      ctx.fillStyle = "#1f2937";
      ctx.font = "900 20px 'Space Mono', monospace";
      ctx.fillText(xUsername ? `@${xUsername}` : "EVM VERIFIED", infoX, fieldY + 23);

      fieldY += 50;

      // WALLET
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.fillText("WALLET ADDRESS", infoX, fieldY);

      ctx.fillStyle = "#374151";
      ctx.font = "bold 15px 'Space Mono', monospace";
      ctx.fillText(
        address ? shortenAddress(address) : "0x0000...0000",
        infoX,
        fieldY + 20
      );

      fieldY += 46;

      // VISITING SINCE
      ctx.fillStyle = "#6b7280";
      ctx.font = "bold 11px 'Space Mono', monospace";
      ctx.fillText("VISITING SINCE", infoX, fieldY);

      ctx.fillStyle = "#111827";
      ctx.font = "900 17px 'Space Mono', monospace";
      ctx.fillText(
        `${formattedDate}  •  HYPERLIQUID L2`,
        infoX,
        fieldY + 22
      );

      // 7. Realistic Barcode with "elychimp.xyz" Pill (matching reference!)
      const barcodeX = infoX;
      const barcodeY = fieldY + 44;
      const barcodeW = cardW - (infoX - cardX) - 34;
      const barcodeH = 50;

      // Draw barcode vertical lines
      ctx.fillStyle = "#18181b";
      let currBX = barcodeX;
      const barWidths = [3, 1, 4, 2, 5, 2, 1, 3, 2, 4, 1, 3, 6, 2, 1, 4, 2, 3];
      let bIdx = 0;
      while (currBX < barcodeX + barcodeW) {
        const bw = barWidths[bIdx % barWidths.length];
        const gap = (bIdx % 3 === 0 ? 3 : 2);
        ctx.fillRect(currBX, barcodeY, bw, barcodeH);
        currBX += bw + gap;
        bIdx++;
      }

      // White overlay pill with "elychimp.xyz" inside barcode
      const pillUrlW = 210;
      const pillUrlH = 34;
      const pillUrlX = barcodeX + (barcodeW - pillUrlW) / 2 + 30;
      const pillUrlY = barcodeY + (barcodeH - pillUrlH) / 2;

      ctx.fillStyle = "#ffffff";
      drawRoundRect(ctx, pillUrlX, pillUrlY, pillUrlW, pillUrlH, 6);
      ctx.fill();
      ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = "#111827";
      ctx.font = "900 17px 'Space Mono', monospace";
      ctx.textAlign = "center";
      ctx.fillText("elychimp.xyz", pillUrlX + pillUrlW / 2, pillUrlY + 22);

      // 8. Bottom Serial Strip
      const bottomBarY = cardY + cardH - 50;
      const bottomBarH = 50;

      ctx.fillStyle = "#edeef2";
      ctx.fillRect(cardX, bottomBarY, cardW, bottomBarH);

      ctx.strokeStyle = "rgba(0, 0, 0, 0.1)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cardX, bottomBarY);
      ctx.lineTo(cardX + cardW, bottomBarY);
      ctx.stroke();

      ctx.fillStyle = "#374151";
      ctx.font = "bold 13px 'Space Mono', monospace";
      ctx.textAlign = "center";
      const serialText = `SERIAL: ELY-${isGtd ? "GTD" : "FCFS"}-${paddedNum}  •  elychimp.xyz`;
      ctx.fillText(serialText, cardX + cardW / 2, bottomBarY + 30);

      ctx.restore(); // restore card clipping

      // 9. Playful Banana Stickers (stuck onto the card like the pickles in reference!)
      // Banana 1: Near top-right by CASE NO.
      drawCanvasBanana(ctx, cardX + cardW - 200, cardY + 115, 0.95, -16);
      // Banana 2: Right side of card
      drawCanvasBanana(ctx, cardX + cardW - 75, cardY + 270, 0.9, 28);
      // Banana 3: Bottom right overlapping barcode & MRZ
      drawCanvasBanana(ctx, cardX + cardW - 130, cardY + cardH - 65, 1.15, 8);

      // 10. Diagonal Glass / Plastic Glare across the sleeve
      ctx.save();
      const glareGrad = ctx.createLinearGradient(sleeveX, sleeveY, sleeveX + sleeveW, sleeveY + sleeveH);
      glareGrad.addColorStop(0, "rgba(255, 255, 255, 0.0)");
      glareGrad.addColorStop(0.35, "rgba(255, 255, 255, 0.12)");
      glareGrad.addColorStop(0.42, "rgba(255, 255, 255, 0.22)");
      glareGrad.addColorStop(0.48, "rgba(255, 255, 255, 0.05)");
      glareGrad.addColorStop(1, "rgba(255, 255, 255, 0.0)");

      ctx.fillStyle = glareGrad;
      drawRoundRect(ctx, sleeveX, sleeveY, sleeveW, sleeveH, sleeveR);
      ctx.fill();
      ctx.restore();

      // Trigger high-res file download
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.download = `elychimp-pass-${paddedNum}.png`;
      a.href = dataUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch (err) {
      console.error("Card download failed:", err);
    } finally {
      setIsGenerating(false);
    }
  }, [
    isGtd,
    paddedNum,
    displayName,
    xUsername,
    address,
    avatarUrl,
    formattedDate,
  ]);

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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto"
    >
      <div className="relative my-auto w-full max-w-3xl rounded-2xl border border-zinc-800 bg-[#0c0d15] p-4 sm:p-6 shadow-2xl space-y-4">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-zinc-400 hover:text-white p-1 rounded-lg border border-zinc-800 hover:border-zinc-700 transition-colors z-10"
          aria-label="Close modal"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1 pr-8">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-amber-400" />
            <span className="font-mono-street text-[10px] font-bold text-amber-400 uppercase tracking-widest">
              OFFICIAL SYNDICATE ID BADGE
            </span>
          </div>
          <h3
            id="share-card-title"
            className="font-display text-xl sm:text-2xl uppercase tracking-wider text-white"
          >
            Syndicate Clearance Pass
          </h3>
          <p className="text-xs text-zinc-400 font-mono-street">
            Optimized for Twitter/X sharing with full assembled avatar and security clearance details.
          </p>
        </div>

        {/* Realistic Lanyard ID Badge Card Preview (Twitter 16:9 Landscape) */}
        <div className="relative w-full overflow-hidden rounded-2xl bg-gradient-to-br from-[#a3a7c8] to-[#bcc0dc] p-3 sm:p-5 shadow-xl select-none">
          {/* Translucent Acrylic Sleeve Holder */}
          <div className="relative mx-auto rounded-[22px] border-2 border-white/80 bg-white/40 p-2 sm:p-3 shadow-[0_12px_32px_rgba(0,0,0,0.18)] backdrop-blur-xs">
            {/* Top Lanyard Slot */}
            <div className="mx-auto mb-2 h-2.5 sm:h-3.5 w-24 sm:w-32 rounded-full border border-white/80 bg-[#7b809d] shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]" />

            {/* Inner White Paper Card */}
            <div className="relative overflow-hidden rounded-xl border border-black/10 bg-[#fafafd] shadow-sm">
              {/* Header: Forest Green Syndicate Band */}
              <div className="flex items-center justify-between bg-[#16452d] px-3 sm:px-5 py-2.5 sm:py-3 text-white border-b-2 border-[#2d704c]">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/elychimp-logo.png"
                    alt="Elychimp Logo"
                    className="h-7 sm:h-10 w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,0.3)]"
                  />
                  <div>
                    <h4 className="font-display text-sm sm:text-lg uppercase tracking-wide leading-none text-white">
                      Elychimp Syndicate
                    </h4>
                    <span className="font-mono-street text-[8px] sm:text-[10px] text-emerald-200 tracking-wider">
                      Official Syndicate ID Badge
                    </span>
                  </div>
                </div>

                {/* Taped Slot No. Tag */}
                <div className="relative -rotate-2 rounded-sm bg-emerald-300/90 px-2 sm:px-2.5 py-0.5 sm:py-1 font-mono-street text-[9px] sm:text-[11px] text-emerald-950 shadow-sm border border-emerald-400/80 font-bold">
                  <span className="block text-[7px] uppercase tracking-widest text-emerald-900 leading-none">
                    SLOT NO.
                  </span>
                  <span>#{paddedNum}</span>
                </div>
              </div>

              {/* Main Body: Photo + Info Fields */}
              <div className="p-3 sm:p-5 flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
                {/* Photo ID on Left */}
                <div className="flex flex-col items-center shrink-0 mx-auto sm:mx-0">
                  <div className="relative p-1.5 sm:p-2 bg-white rounded-lg border border-black/15 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={
                        avatarUrl ||
                        (address
                          ? `/api/renders/avatar/${encodeURIComponent(address)}`
                          : "/images/chimp-base-bw.png")
                      }
                      alt="Elychimp Assembled Character"
                      className="h-28 w-28 sm:h-44 sm:w-44 object-contain [image-rendering:pixelated] rounded"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          "/images/chimp-base-bw.png";
                      }}
                    />

                    {/* Red Circular Verification Stamp Overlaid */}
                    <div className="absolute -bottom-3 -left-3 pointer-events-none select-none -rotate-12 border-2 border-red-600/85 rounded-full p-1 text-center text-red-600 font-display leading-none bg-white/70 backdrop-blur-2xs shadow-sm">
                      <div className="rounded-full border border-red-600/70 p-1.5 sm:p-2 flex flex-col items-center justify-center">
                        <span className="text-[6px] sm:text-[7px] font-mono font-bold tracking-widest text-red-600">
                          ★ ELYCHIMP ★
                        </span>
                        <span className="text-[10px] sm:text-xs font-black tracking-wider my-0.5 text-red-600">
                          {isGtd ? "GUARANTEED" : "REGISTERED"}
                        </span>
                        <span className="text-[5px] sm:text-[6px] font-mono text-red-600/80">
                          CLEARANCE
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Dark Pill Under Photo */}
                  <div className="mt-2.5 w-full rounded-md bg-[#111827] px-3 py-1 text-center text-white font-display text-[11px] sm:text-xs tracking-wider shadow-sm">
                    {isGtd ? "GUARANTEED MINTER" : "FCFS VISITOR"}
                  </div>
                </div>

                {/* Identity Information on Right */}
                <div className="flex-1 w-full space-y-2.5 sm:space-y-3 font-mono-street text-left">
                  <div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                      NAME
                    </span>
                    <p className="font-display text-lg sm:text-2xl uppercase tracking-wider text-gray-900 leading-tight">
                      {displayName}
                    </p>
                  </div>

                  <div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                      ACCOUNT
                    </span>
                    <p className="font-mono-street text-xs sm:text-sm font-bold text-gray-800">
                      {xUsername ? `@${xUsername}` : "EVM Verified"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                      WALLET ADDRESS
                    </span>
                    <p className="font-mono-street text-[11px] sm:text-xs font-semibold text-gray-600">
                      {address ? shortenAddress(address) : "0x0000...0000"}
                    </p>
                  </div>

                  <div>
                    <span className="text-[9px] sm:text-[10px] font-bold text-gray-500 uppercase tracking-widest block">
                      VISITING SINCE
                    </span>
                    <p className="font-mono-street text-[11px] sm:text-xs font-bold text-gray-900">
                      {formattedDate} • HYPERLIQUID L2
                    </p>
                  </div>

                  {/* Realistic Barcode with elychimp.xyz pill */}
                  <div className="relative pt-1 flex items-center justify-between">
                    <div className="h-9 w-full bg-[repeating-linear-gradient(90deg,#18181b,#18181b_2px,transparent_2px,transparent_4px,#18181b_4px,#18181b_7px,transparent_7px,transparent_9px)] opacity-90 rounded" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="rounded-md border border-black/40 bg-white px-3 py-0.5 font-mono-street text-[10px] sm:text-xs font-bold text-gray-900 shadow-sm">
                        elychimp.xyz
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Serial Strip */}
              <div className="border-t border-zinc-200 bg-[#edeef2] px-3 sm:px-4 py-2 text-center font-mono-street text-[9px] sm:text-[11px] font-bold tracking-wider text-zinc-700 select-all uppercase">
                SERIAL: ELY-{isGtd ? "GTD" : "FCFS"}-{paddedNum} &bull; elychimp.xyz
              </div>
            </div>

            {/* Playful Die-Cut Banana Stickers */}
            <BananaSticker
              className="absolute top-10 right-24 sm:right-32 w-16 sm:w-24 h-8 sm:h-12 -rotate-12"
            />
            <BananaSticker
              className="absolute top-36 sm:top-40 -right-2 sm:right-2 w-14 sm:w-20 h-7 sm:h-10 rotate-24"
            />
            <BananaSticker
              className="absolute bottom-10 sm:bottom-12 right-12 sm:right-16 w-18 sm:w-28 h-9 sm:h-14 rotate-6"
            />

            {/* Diagonal Plastic Glare Highlight */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/10 to-transparent rounded-[20px]" />
            <div className="pointer-events-none absolute -top-1/2 left-1/4 h-[200%] w-24 -rotate-45 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
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
              className="w-full gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-yellow-400 to-amber-300 text-black hover:bg-amber-300 font-mono-street font-bold text-xs uppercase tracking-wider py-3.5 shadow-brutal-sm cursor-pointer transition-all hover:scale-[1.01] active:scale-[0.99]"
            >
              <Download className="h-4 w-4" />
              <span>{isGenerating ? "Rendering PNG..." : "Download Card (PNG • 16:9)"}</span>
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

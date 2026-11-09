"use client";

import React, { useState, useRef, useCallback, useEffect } from "react";

export interface SpecimenItem {
  id: string;
  number: string;
  name: string;
  tag: string;
  traits: {
    bg: { name: string; file: string };
    fur: { name: string; file: string };
    clothing: { name: string; file: string };
    eyewear: { name: string; file: string };
    headwear: { name: string; file: string };
    face?: { name: string; file: string };
  };
}

export const SPECIMENS: SpecimenItem[] = [
  {
    id: "specimen-1",
    number: "0001",
    name: "Solar Drifter",
    tag: "Iconic Genesis",
    traits: {
      bg: { name: "Sky", file: "/traits/sky.png" },
      fur: { name: "Gold", file: "/traits/gold.png" },
      clothing: { name: "Varsity", file: "/traits/varsity-jacket.png" },
      eyewear: { name: "Matrix", file: "/traits/matrix-shades.png" },
      headwear: { name: "Snapback", file: "/traits/snapback.png" },
    },
  },
  {
    id: "specimen-2",
    number: "0002",
    name: "Stealth Heist",
    tag: "Tactical Operative",
    traits: {
      bg: { name: "Dusk", file: "/traits/dusk.png" },
      fur: { name: "Cocoa", file: "/traits/cocoa.png" },
      clothing: { name: "Heist Suit", file: "/traits/money-heist-suit.png" },
      eyewear: { name: "Mirror", file: "/traits/mirror-shield.png" },
      headwear: { name: "Beanie", file: "/traits/black-beanie.png" },
    },
  },
  {
    id: "specimen-3",
    number: "0003",
    name: "Obsidian Rocker",
    tag: "Underground Rebel",
    traits: {
      bg: { name: "Dusk", file: "/traits/dusk.png" },
      fur: { name: "Skeleton", file: "/traits/skeleton.png" },
      clothing: { name: "Rockstar", file: "/traits/rockstar-jacket.png" },
      eyewear: { name: "Aviator", file: "/traits/aviator-gold.png" },
      headwear: { name: "Fedora", file: "/traits/fedora.png" },
    },
  },
  {
    id: "specimen-4",
    number: "0004",
    name: "High Roller",
    tag: "Apex Syndicate",
    traits: {
      bg: { name: "Amber", file: "/traits/amber.png" },
      fur: { name: "Pearl", file: "/traits/pearl.png" },
      clothing: { name: "Joker Suit", file: "/traits/joker-suit.png" },
      face: { name: "Bubblegum", file: "/traits/bubblegum.png" },
      eyewear: { name: "Rectangle", file: "/traits/small-black-rectangle.png" },
      headwear: { name: "Buzz Cut", file: "/traits/buzz-cut.png" },
    },
  },
  {
    id: "specimen-5",
    number: "0005",
    name: "Vice City",
    tag: "Neon Tropic",
    traits: {
      bg: { name: "Mint", file: "/traits/mint.png" },
      fur: { name: "Cocoa", file: "/traits/cocoa.png" },
      clothing: { name: "Hawaiian", file: "/traits/hawaiian-shirt.png" },
      eyewear: { name: "None", file: "/traits/none.png" },
      headwear: { name: "None", file: "/traits/none.png" },
    },
  },
  {
    id: "specimen-6",
    number: "0006",
    name: "Sukajan Ronin",
    tag: "Tokyo Drift",
    traits: {
      bg: { name: "Sand", file: "/traits/sand.png" },
      fur: { name: "Gold", file: "/traits/gold.png" },
      clothing: { name: "Sukajan", file: "/traits/sukajan.png" },
      eyewear: { name: "None", file: "/traits/none.png" },
      headwear: { name: "Top Hat", file: "/traits/top-hat.png" },
    },
  },
  {
    id: "specimen-7",
    number: "0007",
    name: "Street Vanguard",
    tag: "Urban Rebel",
    traits: {
      bg: { name: "Sky", file: "/traits/sky.png" },
      fur: { name: "Pearl", file: "/traits/pearl.png" },
      clothing: { name: "Hoodie", file: "/traits/hoodie.png" },
      eyewear: { name: "Red Visor", file: "/traits/red-visor.png" },
      headwear: { name: "Ball Cap", file: "/traits/ball-cap.png" },
    },
  },
  {
    id: "specimen-8",
    number: "0008",
    name: "Midnight Syndicate",
    tag: "Luxe Dynasty",
    traits: {
      bg: { name: "Abyss", file: "/traits/abyss.png" },
      fur: { name: "Obsidian", file: "/traits/obsidian.png" },
      clothing: { name: "Tuxedo", file: "/traits/tuxedo.png" },
      eyewear: { name: "None", file: "/traits/none.png" },
      headwear: { name: "Officer Cap", file: "/traits/officer-cap.png" },
      face: { name: "Cigarette", file: "/traits/cigarette.png" },
    },
  },
  {
    id: "specimen-9",
    number: "0009",
    name: "Outland Nomad",
    tag: "Wasteland Scout",
    traits: {
      bg: { name: "Ice", file: "/traits/ice.png" },
      fur: { name: "Ember", file: "/traits/ember.png" },
      clothing: { name: "Explorer", file: "/traits/explorer-jacket.png" },
      eyewear: { name: "Retro 3D", file: "/traits/retro-3d.png" },
      headwear: { name: "Cowboy", file: "/traits/cowboy-hat.png" },
    },
  },
  {
    id: "specimen-10",
    number: "0010",
    name: "Crimson Outlaw",
    tag: "Rogue Rebel",
    traits: {
      bg: { name: "Dusk", file: "/traits/dusk.png" },
      fur: { name: "Cocoa", file: "/traits/cocoa.png" },
      clothing: { name: "Leather Jacket", file: "/traits/leather-jacket.png" },
      face: { name: "Red Bandana", file: "/traits/bandana-red.png" },
      eyewear: { name: "None", file: "/traits/none.png" },
      headwear: { name: "Beanie", file: "/traits/black-beanie.png" },
    },
  },
];

export function CoverflowCarousel() {
  // Start on index 2 (Specimen #0003: Obsidian Rocker) directly centered as in the screenshot
  const [activeIndex, setActiveIndex] = useState(2);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const startXRef = useRef(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Responsive breakpoint tracking
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const total = SPECIMENS.length;
  const currentSpecimen = SPECIMENS[activeIndex];

  // Infinite looping handlers
  const handlePrev = useCallback(() => {
    setActiveIndex((prev) => (prev - 1 + total) % total);
  }, [total]);

  const handleNext = useCallback(() => {
    setActiveIndex((prev) => (prev + 1) % total);
  }, [total]);

  // Pointer drag gestures
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    startXRef.current = e.clientX;
    setDragOffset(0);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const diff = e.clientX - startXRef.current;
    setDragOffset(diff);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!isDragging) return;
    setIsDragging(false);
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // Ignored if capture lost
    }

    const threshold = 45;
    if (dragOffset > threshold) {
      handlePrev();
    } else if (dragOffset < -threshold) {
      handleNext();
    }
    setDragOffset(0);
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        handlePrev();
      } else if (e.key === "ArrowRight") {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNext, handlePrev]);

  return (
    <div
      ref={containerRef}
      className="relative w-full select-none"
      aria-label="Elysium 3D Specimen Showcase"
      role="region"
    >
      {/* 3D Runway Stage Container */}
      <div
        className="relative mx-auto h-[290px] sm:h-[360px] md:h-[400px] w-full max-w-5xl overflow-hidden touch-pan-y cursor-grab active:cursor-grabbing [perspective:1000px]"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="absolute inset-0 flex items-center justify-center [transform-style:preserve-3d]">
          {SPECIMENS.map((specimen, idx) => {
            // Infinite looping offset calculation (wraps to shortest distance)
            let offset = idx - activeIndex;
            const half = Math.floor(total / 2);
            while (offset > half) offset -= total;
            while (offset < -half) offset += total;

            const isCenter = offset === 0;

            // Responsive spacing & 3D focal geometry
            const spacing = isMobile ? 84 : 165;
            const translateX = offset * spacing + (isDragging ? dragOffset * 0.45 : 0);
            const translateZ = isCenter
              ? isMobile
                ? 25
                : 0
              : isMobile
                ? -Math.abs(offset) * 115
                : -Math.abs(offset) * 85;
            const rotateY = isCenter ? 0 : offset < 0 ? (isMobile ? 46 : 35) : (isMobile ? -46 : -35);
            const scale = isCenter ? (isMobile ? 1.05 : 1.02) : isMobile ? 0.72 : 0.82;
            const opacity = isCenter
              ? 1
              : isMobile
                ? Math.abs(offset) === 1
                  ? 0.32
                  : 0
                : Math.abs(offset) > 2
                  ? 0
                  : Math.max(0.32, 1 - Math.abs(offset) * 0.3);
            const zIndex = 30 - Math.abs(offset);

            // Smooth spring transition without glitch when wrapping
            const isWrapping = Math.abs(offset) >= 3;

            return (
              <div
                key={specimen.id}
                onClick={() => {
                  if (!isCenter) setActiveIndex(idx);
                }}
                className={`absolute w-[190px] xs:w-[210px] sm:w-[270px] md:w-[310px] ${
                  isCenter ? "cursor-default" : "cursor-pointer"
                }`}
                style={{
                  transform: `translateX(${translateX}px) translateZ(${translateZ}px) rotateY(${rotateY}deg) scale(${scale})`,
                  opacity,
                  zIndex,
                  pointerEvents: isCenter ? "auto" : isMobile && Math.abs(offset) > 1 ? "none" : "auto",
                  transformOrigin: "center center",
                  transition: isDragging
                    ? "none"
                    : isWrapping
                      ? "opacity 0.25s ease"
                      : "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.45s ease",
                }}
              >
                {/* Specimen Frame Card */}
                <div
                  className={`relative overflow-hidden rounded-2xl border p-2.5 sm:p-3.5 backdrop-blur-xl transition-all duration-300 ${
                    isCenter
                      ? "border-2 border-[#4AE2FF] bg-[#07242C]/98 shadow-[0_0_36px_rgba(74,226,255,0.45),0_24px_55px_rgba(2,10,12,0.95)] ring-1 ring-[#7DE8FF]/30"
                      : "border border-[#163B44]/60 bg-[#051D22]/65 shadow-[0_10px_25px_rgba(2,10,12,0.7)] brightness-65 contrast-90 hover:border-[#34B7DD]/60 hover:brightness-90"
                  }`}
                >
                  {/* 100% Flush Pixel-Perfect Layered Canvas */}
                  <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-[#163B44]/90 bg-[#04181C] shadow-inner">
                    {/* Layer 0: Background */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={specimen.traits.bg.file}
                      alt={`${specimen.name} Background`}
                      width={240}
                      height={240}
                      loading="eager"
                      className="absolute inset-0 block h-full w-full object-cover select-none [image-rendering:pixelated]"
                    />

                    {/* Layer 1: Fur (Primate Body Structure) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={specimen.traits.fur.file}
                      alt={`${specimen.name} Fur`}
                      width={240}
                      height={240}
                      loading="eager"
                      className="absolute inset-0 block h-full w-full object-cover select-none [image-rendering:pixelated]"
                    />

                    {/* Layer 2: Clothing */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={specimen.traits.clothing.file}
                      alt={`${specimen.name} Apparel`}
                      width={240}
                      height={240}
                      loading="eager"
                      className="absolute inset-0 block h-full w-full object-cover select-none [image-rendering:pixelated]"
                    />

                    {/* Layer 2.5: Face Accessory (Cigarette, etc.) */}
                    {specimen.traits.face && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={specimen.traits.face.file}
                        alt={`${specimen.name} Face Feature`}
                        width={240}
                        height={240}
                        loading="eager"
                        className="absolute inset-0 block h-full w-full object-cover select-none [image-rendering:pixelated]"
                      />
                    )}

                    {/* Layer 3: Eyewear */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={specimen.traits.eyewear.file}
                      alt={`${specimen.name} Eyewear`}
                      width={240}
                      height={240}
                      loading="eager"
                      className="absolute inset-0 block h-full w-full object-cover select-none [image-rendering:pixelated]"
                    />

                    {/* Layer 4: Headwear (Hats over glasses as documented in generator pack) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={specimen.traits.headwear.file}
                      alt={`${specimen.name} Headwear`}
                      width={240}
                      height={240}
                      loading="eager"
                      className="absolute inset-0 block h-full w-full object-cover select-none [image-rendering:pixelated]"
                    />

                    {/* Studio Glare */}
                    <div className="pointer-events-none absolute inset-0 bg-gradient-to-tr from-transparent via-white/[0.04] to-transparent" />
                  </div>

                  {/* Card Footnote: Pure Clean Character Title */}
                  <div className="mt-2.5 text-center font-sans text-[10px] sm:text-[11px] font-bold tracking-[0.16em] text-[#F8F7F4] uppercase">
                    <span className="truncate">{specimen.name}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Luxury Floating Runway Console */}
      <div className="mx-auto mt-2.5 sm:mt-5 flex items-center justify-center px-4">
        <div className="inline-flex items-center gap-3.5 sm:gap-7 rounded-full border border-[#1E4D5A]/80 bg-[#072026]/90 px-4 sm:px-8 py-1.5 sm:py-2.5 backdrop-blur-2xl shadow-[inset_0_1px_1px_rgba(255,255,255,0.15),0_12px_32px_rgba(2,10,12,0.8)] transition-all">
          <button
            type="button"
            onClick={handlePrev}
            className="font-sans text-[10px] sm:text-xs font-bold tracking-[0.2em] text-[#8AA8B2] transition-all hover:text-[#34B7DD] active:scale-95 cursor-pointer uppercase select-none px-1.5 py-0.5"
          >
            PREV
          </button>

          <div className="h-3 sm:h-3.5 w-px bg-[#1E4D5A]" />

          <div className="font-sans text-[11px] sm:text-sm font-bold tracking-[0.16em] text-[#F8F7F4] uppercase select-none">
            {currentSpecimen.name}
          </div>

          <div className="h-3 sm:h-3.5 w-px bg-[#1E4D5A]" />

          <button
            type="button"
            onClick={handleNext}
            className="font-sans text-[10px] sm:text-xs font-bold tracking-[0.2em] text-[#8AA8B2] transition-all hover:text-[#34B7DD] active:scale-95 cursor-pointer uppercase select-none px-1.5 py-0.5"
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}

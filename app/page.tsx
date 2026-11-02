import React from "react";
import Link from "next/link";
import {
  Sparkles,
  Shield,
  Gift,
  User,
  FileText,
  Layers,
  ArrowRight,
  Palette,
  Eye,
  Shirt,
  Smile,
  ImageIcon,
  CheckCircle2,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { PlaceholderNotice } from "@/components/ui/PlaceholderNotice";

interface TraitItem {
  name: string;
  image: string;
}

interface TraitCategorySection {
  title: string;
  categoryKey: string;
  icon: React.ReactNode;
  accentBorder: string;
  accentBg: string;
  accentText: string;
  traits: TraitItem[];
}

const TRAIT_CATEGORIES: TraitCategorySection[] = [
  {
    title: "Background",
    categoryKey: "background",
    icon: <ImageIcon className="h-4 w-4" />,
    accentBorder: "border-sky-500/30",
    accentBg: "bg-sky-500/10",
    accentText: "text-sky-400",
    traits: [
      { name: "Sky Blue", image: "/traits/sky.png" },
      { name: "Mint Fresh", image: "/traits/mint.png" },
      { name: "Amber Glow", image: "/traits/amber.png" },
      { name: "Dusk Violet", image: "/traits/dusk.png" },
      { name: "Pearl White", image: "/traits/pearl.png" },
      { name: "Desert Sand", image: "/traits/sand.png" },
    ],
  },
  {
    title: "Fur",
    categoryKey: "fur",
    icon: <Smile className="h-4 w-4" />,
    accentBorder: "border-amber-500/30",
    accentBg: "bg-amber-500/10",
    accentText: "text-amber-400",
    traits: [
      { name: "Golden Fur", image: "/traits/gold.png" },
      { name: "Cocoa Brown", image: "/traits/cocoa.png" },
      { name: "Graphite Grey", image: "/traits/graphite.png" },
      { name: "Skeleton", image: "/traits/skeleton.png" },
    ],
  },
  {
    title: "Clothing",
    categoryKey: "clothing",
    icon: <Shirt className="h-4 w-4" />,
    accentBorder: "border-violet-500/30",
    accentBg: "bg-violet-500/10",
    accentText: "text-violet-400",
    traits: [
      { name: "Varsity Jacket", image: "/traits/varsity-jacket.png" },
      { name: "Street Hoodie", image: "/traits/hoodie.png" },
      { name: "Rockstar Jacket", image: "/traits/rockstar-jacket.png" },
      { name: "Heist Jumpsuit", image: "/traits/money-heist-suit.png" },
      { name: "Joker Suit", image: "/traits/joker-suit.png" },
    ],
  },
  {
    title: "Headwear",
    categoryKey: "headwear",
    icon: <Layers className="h-4 w-4" />,
    accentBorder: "border-emerald-500/30",
    accentBg: "bg-emerald-500/10",
    accentText: "text-emerald-400",
    traits: [
      { name: "Classic Snapback", image: "/traits/snapback.png" },
      { name: "Black Beanie", image: "/traits/black-beanie.png" },
      { name: "Detective Fedora", image: "/traits/fedora.png" },
      { name: "Baseball Cap", image: "/traits/ball-cap.png" },
      { name: "Buzz Cut", image: "/traits/buzz-cut.png" },
    ],
  },
  {
    title: "Eyewear",
    categoryKey: "eyewear",
    icon: <Eye className="h-4 w-4" />,
    accentBorder: "border-teal-500/30",
    accentBg: "bg-teal-500/10",
    accentText: "text-teal-400",
    traits: [
      { name: "Matrix Shades", image: "/traits/matrix-shades.png" },
      { name: "Gold Aviators", image: "/traits/aviator-gold.png" },
      { name: "Cyber Shield", image: "/traits/mirror-shield.png" },
      { name: "Retro Rectangles", image: "/traits/small-black-rectangle.png" },
    ],
  },
];

export default function HomePage() {
  return (
    <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-12 lg:px-8">
      {/* Hero Section */}
      <section className="relative mb-20 overflow-hidden rounded-3xl border border-emerald-500/20 bg-gradient-to-b from-[#111728] via-[#0c101d] to-[#090b14] p-6 shadow-2xl sm:p-10 lg:p-16">
        {/* Playful Ambient Background Lighting */}
        <div className="pointer-events-none absolute -top-24 -left-24 h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="pointer-events-none absolute -right-24 -bottom-24 h-96 w-96 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-72 w-72 rounded-full bg-amber-500/10 blur-3xl" />

        <div className="relative z-10 grid grid-cols-1 items-center gap-12 lg:grid-cols-12 lg:gap-8">
          {/* Hero Content (Left) */}
          <div className="flex flex-col items-center text-center lg:col-span-7 lg:items-start lg:text-left">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1 text-xs font-semibold text-emerald-300">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Original Pixel Art Chimp Ecosystem</span>
            </div>

            <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl lg:text-7xl">
              <span>Welcome to</span>{" "}
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 bg-clip-text text-transparent">
                ChimpHood
              </span>
            </h1>

            <p className="mt-5 max-w-xl text-base leading-relaxed text-gray-300 sm:text-lg">
              The premier pixel-art chimp character collection and community ecosystem.
              Collect unique 24×24 layered traits, equip dynamic on-chain avatar identities,
              and participate in scheduled community lootbox drops.
            </p>

            {/* Hero CTAs */}
            <div className="mt-8 flex w-full flex-col items-center gap-4 sm:w-auto sm:flex-row">
              <Link href="/whitelist" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  className="w-full gap-2 border-0 bg-gradient-to-r from-emerald-500 to-teal-500 font-bold text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-400 hover:to-teal-400 sm:w-auto"
                >
                  Explore Whitelist <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/drops" className="w-full sm:w-auto">
                <Button
                  size="lg"
                  variant="secondary"
                  className="w-full gap-2 border border-purple-500/30 bg-purple-500/10 font-bold text-purple-300 hover:bg-purple-500/20 hover:text-white sm:w-auto"
                >
                  Explore Drops <Gift className="h-4 w-4 text-purple-400" />
                </Button>
              </Link>
            </div>

            {/* Quick Secondary Links */}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-400 lg:justify-start">
              <Link
                href="/profile"
                className="flex items-center gap-1.5 font-medium text-gray-300 transition-colors hover:text-emerald-400"
              >
                <User className="h-4 w-4 text-emerald-400" />
                <span>Profile & Identity</span>
              </Link>
              <span className="text-gray-600">•</span>
              <Link
                href="/docs"
                className="flex items-center gap-1.5 font-medium text-gray-300 transition-colors hover:text-emerald-400"
              >
                <FileText className="h-4 w-4 text-blue-400" />
                <span>Read Documentation</span>
              </Link>
            </div>
          </div>

          {/* Hero Mascot Focus (Right) */}
          <div className="flex flex-col items-center lg:col-span-5">
            <div className="group relative">
              {/* Outer Glow Ring */}
              <div className="absolute -inset-2 rounded-3xl bg-gradient-to-tr from-emerald-500/30 via-teal-500/20 to-amber-500/30 opacity-75 blur-xl transition duration-500 group-hover:opacity-100" />

              {/* Mascot Showcase Card */}
              <div className="relative rounded-3xl border-2 border-emerald-500/40 bg-[#0b0e17] p-4 shadow-2xl">
                {/* Header Badge */}
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    Genesis Mascot
                  </span>
                  <span className="font-mono text-[11px] text-gray-400">
                    24×24 • 10× Upscaled
                  </span>
                </div>

                {/* Composite Pixel Mascot Canvas */}
                <div className="relative aspect-square w-64 overflow-hidden rounded-2xl border border-gray-800 bg-[#07090e] shadow-inner sm:w-72 md:w-80">
                  {/* Layer 0: Background */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/sky.png"
                    alt="Mascot Sky Background"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 1: Base Chimp Silhouette / Structure */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/images/chimp-base-bw.png"
                    alt="Mascot Base Chimp"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated] opacity-30"
                  />

                  {/* Layer 2: Fur Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/gold.png"
                    alt="Mascot Golden Fur"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 3: Clothing Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/varsity-jacket.png"
                    alt="Mascot Varsity Jacket"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 4: Headwear Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/snapback.png"
                    alt="Mascot Snapback"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />

                  {/* Layer 5: Eyewear Layer */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/traits/matrix-shades.png"
                    alt="Mascot Matrix Shades"
                    className="absolute inset-0 h-full w-full object-contain [image-rendering:pixelated]"
                  />
                </div>

                {/* Equipped Layer Tags */}
                <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 pt-1">
                  <span className="rounded bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 border border-sky-500/20">
                    Sky
                  </span>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300 border border-amber-500/20">
                    Golden Fur
                  </span>
                  <span className="rounded bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300 border border-violet-500/20">
                    Varsity Jacket
                  </span>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300 border border-emerald-500/20">
                    Snapback
                  </span>
                  <span className="rounded bg-teal-500/10 px-2 py-0.5 text-[10px] font-medium text-teal-300 border border-teal-500/20">
                    Matrix Shades
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Ecosystem Cards Section */}
      <section className="mb-20">
        <div className="mb-8 text-center sm:text-left">
          <Badge variant="default" className="mb-2">
            Ecosystem Modules
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Explore ChimpHood Features
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            Real functionality built for collectors, communities, and Web3 enthusiasts.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {/* Card 1: Drops & Lootbox */}
          <Card className="flex flex-col justify-between border-purple-500/20 bg-gradient-to-b from-purple-950/20 to-[#0d101d] transition-all hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10">
            <div>
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-xl border border-purple-500/30 bg-purple-500/10 p-2.5 text-purple-400">
                    <Gift className="h-6 w-6" />
                  </div>
                  <Badge variant="success">Active Engine</Badge>
                </div>
                <CardTitle className="text-lg font-bold text-white">
                  Drops & Lootbox
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Periodic scheduled drop cycles, lootbox claim mechanics with instant reveals, and collector trait gifting.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 text-xs text-purple-300">
                  <span className="rounded bg-purple-500/10 px-2 py-0.5 border border-purple-500/20">
                    Drop Cycles
                  </span>
                  <span className="rounded bg-purple-500/10 px-2 py-0.5 border border-purple-500/20">
                    Lootbox Reveal
                  </span>
                  <span className="rounded bg-purple-500/10 px-2 py-0.5 border border-purple-500/20">
                    Inventory Gifting
                  </span>
                </div>
              </CardContent>
            </div>
            <div className="p-6 pt-0">
              <Link href="/drops" className="block w-full">
                <Button variant="secondary" className="w-full justify-between hover:bg-purple-900/30 hover:text-purple-200">
                  Go to Drops <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Card 2: Whitelist & Community Tasks */}
          <Card className="flex flex-col justify-between border-emerald-500/20 bg-gradient-to-b from-emerald-950/20 to-[#0d101d] transition-all hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10">
            <div>
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-emerald-400">
                    <Shield className="h-6 w-6" />
                  </div>
                  <Badge variant="default">Whitelist Allocation</Badge>
                </div>
                <CardTitle className="text-lg font-bold text-white">
                  Whitelist & Community Tasks
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Earn guaranteed (GTD) allocations and first-come-first-served (FCFS) queue positions by completing community quests.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 text-xs text-emerald-300">
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">
                    GTD Slots
                  </span>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">
                    FCFS Queue
                  </span>
                  <span className="rounded bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">
                    Task Evidence
                  </span>
                </div>
              </CardContent>
            </div>
            <div className="p-6 pt-0">
              <Link href="/whitelist" className="block w-full">
                <Button variant="secondary" className="w-full justify-between hover:bg-emerald-900/30 hover:text-emerald-200">
                  Go to Whitelist <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Card 3: Profile & Collection */}
          <Card className="flex flex-col justify-between border-amber-500/20 bg-gradient-to-b from-amber-950/20 to-[#0d101d] transition-all hover:border-amber-500/40 hover:shadow-lg hover:shadow-amber-500/10">
            <div>
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-2.5 text-amber-400">
                    <User className="h-6 w-6" />
                  </div>
                  <Badge variant="warning">Identity Hub</Badge>
                </div>
                <CardTitle className="text-lg font-bold text-white">
                  Profile & Collection
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Sign in with Ethereum (SIWE), connect verified X identity, inspect inventory items, and render custom avatars.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 text-xs text-amber-300">
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">
                    SIWE Login
                  </span>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">
                    X Linked
                  </span>
                  <span className="rounded bg-amber-500/10 px-2 py-0.5 border border-amber-500/20">
                    Trait Inventory
                  </span>
                </div>
              </CardContent>
            </div>
            <div className="p-6 pt-0">
              <Link href="/profile" className="block w-full">
                <Button variant="secondary" className="w-full justify-between hover:bg-amber-900/30 hover:text-amber-200">
                  Go to Profile <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>

          {/* Card 4: Documentation */}
          <Card className="flex flex-col justify-between border-blue-500/20 bg-gradient-to-b from-blue-950/20 to-[#0d101d] transition-all hover:border-blue-500/40 hover:shadow-lg hover:shadow-blue-500/10">
            <div>
              <CardHeader>
                <div className="mb-3 flex items-center justify-between">
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-2.5 text-blue-400">
                    <FileText className="h-6 w-6" />
                  </div>
                  <Badge variant="outline">Docs & Specs</Badge>
                </div>
                <CardTitle className="text-lg font-bold text-white">
                  Documentation
                </CardTitle>
                <CardDescription className="text-gray-300">
                  Comprehensive technical architecture specifications, SeaDrop allowlist schema, and engineering records.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-1.5 text-xs text-blue-300">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
                    Architecture
                  </span>
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
                    SeaDrop Export
                  </span>
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 border border-blue-500/20">
                    API Reference
                  </span>
                </div>
              </CardContent>
            </div>
            <div className="p-6 pt-0">
              <Link href="/docs" className="block w-full">
                <Button variant="secondary" className="w-full justify-between hover:bg-blue-900/30 hover:text-blue-200">
                  View Docs <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </Card>
        </div>
      </section>

      {/* Trait Showcase Section */}
      <section className="mb-20">
        <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-0.5 text-xs font-semibold text-teal-300">
              <Palette className="h-3.5 w-3.5" />
              <span>Pixel Art Catalog</span>
            </div>
            <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
              Trait Showcase
            </h2>
            <p className="mt-1 max-w-2xl text-sm text-gray-400">
              Visual preview of authentic 24×24 layered artwork across all five core categories.
            </p>
          </div>
        </div>

        {/* 5 Categories Grid */}
        <div className="space-y-8">
          {TRAIT_CATEGORIES.map((category) => (
            <div
              key={category.categoryKey}
              className="rounded-2xl border border-gray-800 bg-[#0e121e]/90 p-5 backdrop-blur sm:p-6"
            >
              {/* Category Header */}
              <div className="mb-4 flex items-center gap-2.5">
                <div
                  className={`rounded-lg border p-1.5 ${category.accentBorder} ${category.accentBg} ${category.accentText}`}
                >
                  {category.icon}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white sm:text-lg">
                    {category.title}
                  </h3>
                  <span className="text-xs text-gray-400">
                    {category.traits.length} original layers
                  </span>
                </div>
              </div>

              {/* Trait Grid */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {category.traits.map((trait) => (
                  <div
                    key={trait.name}
                    className="group flex flex-col items-center rounded-xl border border-gray-800 bg-[#080a11] p-3 transition duration-200 hover:border-gray-700 hover:bg-[#0c0f1a]"
                  >
                    <div className="relative mb-2 aspect-square w-full max-w-[120px] overflow-hidden rounded-lg border border-gray-800/80 bg-[#05070c]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={trait.image}
                        alt={trait.name}
                        className="h-full w-full object-contain [image-rendering:pixelated] transition duration-200 group-hover:scale-105"
                      />
                    </div>
                    <span className="text-center font-mono text-xs font-medium text-gray-300">
                      {trait.name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Community / Platform Information Section */}
      <section className="mb-12">
        <div className="mb-8">
          <Badge variant="default" className="mb-2">
            Architecture & Transparency
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Community & Platform Architecture
          </h2>
          <p className="mt-1 text-sm text-gray-400">
            A transparent overview of the authenticated engines powering ChimpHood.
          </p>
        </div>

        {/* 4 Informational Pillars */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-800 bg-[#111420]/80 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
              <User className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">Wallet & X Identity</h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Sign-In with Ethereum (SIWE / EIP-4361) cryptographic signatures paired with OAuth 2.0 PKCE Twitter/X verification to bind genuine community collectors.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#111420]/80 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-amber-500/20 bg-amber-500/10 text-amber-400">
              <Palette className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">Trait Collection</h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Strict deterministic back-to-front layer compositing (Background → Fur → Clothing → Headwear → Eyewear) preserving pixel sharpness with nearest-neighbor rendering.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#111420]/80 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-purple-500/20 bg-purple-500/10 text-purple-400">
              <Gift className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">Drop Distribution</h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Server-guarded drop windows with concurrency protection, instant reveal mechanics, inventory item tracking, and secure peer-to-peer trait gifting.
            </p>
          </div>

          <div className="rounded-xl border border-gray-800 bg-[#111420]/80 p-5">
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg border border-teal-500/20 bg-teal-500/10 text-teal-400">
              <Shield className="h-5 w-5" />
            </div>
            <h4 className="text-sm font-bold text-white">Whitelist & Quests</h4>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              Dual-track allocation supporting Guaranteed (GTD) slots and First-Come-First-Served (FCFS) queues, backed by admin evidence reviews and SeaDrop allowlist exports.
            </p>
          </div>
        </div>

        {/* Status Verification Card */}
        <div>
          <PlaceholderNotice
            title="Current Implementation Status"
            description="Core platform engines are implemented and verified: SIWE Web3 wallet authentication, Twitter/X linking, Drops & Claim Engine, Trait Gifting, Whitelist & Queue allocation, OpenSea SeaDrop allowlist export, and Admin Security & Abuse Monitoring."
            phase="Production Ready"
          />
        </div>
      </section>
    </div>
  );
}

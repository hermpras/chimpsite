# ChimpHood Site

Decentralized web platform for the ChimpHood ecosystem (Whitelist allocation, Web3 & social identity management, reward claims, community campaigns, and OpenSea SeaDrop allowlist integration).

---

## 📌 Project Status: Production Ready (Core Modules & Security Hardening Complete)

The core architecture, functional business engines, and administrative security subsystems are **fully implemented and verified** across 92 test files with 1,124 automated tests:

- **Identity & Authentication**: Sign-In with Ethereum (SIWE / EIP-4361) via wagmi v3, encrypted Iron Session, and Twitter/X OAuth 2.0 PKCE.
- **Whitelist & Queue Engine**: 5-trait category eligibility check, campaign task verification, first-qualified GTD slot allocation, and deterministic FCFS queue management.
- **Drops & Claims Engine**: Continuous cycle schedule, 30-minute claim windows, atomic inventory minting, stock locks, and anti-overminting protections.
- **Gifting & Inventory**: Atomic duplicate gifting transfer, sender retention invariants, recipient eligibility validation, and on-demand avatar rendering.
- **OpenSea SeaDrop Integration**: Administrative GTD and FCFS allowlist CSV export without headers, lowercase addresses, strict deduplication, and disjoint sets.
- **Security & Abuse Monitoring (DEC-012)**: Sybil cluster IP detection (≥ 5 wallets per IP per cycle), dual-layer rate limiting (per-wallet & per-IP budgets), permanent ban revocation restricted to Super Admin, and Admin Abuse Flags investigation API & UI.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & PostCSS
- **Database ORM**: [Prisma](https://www.prisma.io/) v7 (PostgreSQL target via `prisma.config.ts`)
- **Web3 Connector**: [Wagmi](https://wagmi.sh/) v3 & [Viem](https://viem.sh/) (EIP-4361 SIWE)
- **Session Security**: [Iron Session](https://github.com/vvo/iron-session) (Sealed HttpOnly cookies & SHA-256 session token hashing)
- **Rate Limiting**: Distributed Sliding Window ([@upstash/ratelimit](https://github.com/upstash/ratelimit) & Upstash Redis) with dev in-memory fallback
- **Code Quality**: ESLint (Next.js config) & Prettier
- **Testing**: [Vitest](https://vitest.dev/) & [React Testing Library](https://testing-library.com/)

---

## 📁 Directory Structure

```text
ChimpHood Site/
├── app/                      # Next.js App Router
│   ├── admin/page.tsx        # Super Admin / Moderator Portal
│   ├── api/                  # Backend REST API routes
│   │   ├── admin/            # Abuse flags, whitelist, drops, evidence admin APIs
│   │   ├── auth/             # SIWE nonce, verify, session, config, logout
│   │   ├── cron/             # Scheduled sweep, queue reconcile, cleanup routes
│   │   ├── drops/            # Current drop status & atomic claim execution
│   │   ├── gifts/            # Gifting initiation, listing, and resolution
│   │   ├── renders/          # Trait canvas composite avatar rendering
│   │   ├── social/           # X (Twitter) OAuth connect & callback
│   │   └── whitelist/        # Status checker & qualification trigger
│   ├── docs/page.tsx         # Documentation & Architecture overview
│   ├── profile/page.tsx      # User Profile, SIWE Wallet & X connection card
│   ├── whitelist/page.tsx    # Whitelist & Campaigns portal
│   ├── globals.css           # Tailwind CSS v4 config & theme styles
│   ├── layout.tsx            # Root layout with Wagmi/ReactQuery providers
│   └── page.tsx              # Home landing page with live status
├── components/               # Modular UI components
│   ├── admin/                # Admin sidebar, overview, abuse flags, whitelist, drops UI
│   ├── auth/                 # WalletButton, WalletConnectCard
│   ├── drops/                # Lootbox modal, countdown ticker, stock progress bars
│   ├── inventory/            # Trait grid, gift modal, transfer management
│   ├── layout/               # Navbar, Footer
│   ├── providers.tsx         # Wagmi & TanStack Query providers
│   └── ui/                   # Button, Card, Badge, Modal, PlaceholderNotice
├── docs/                     # Technical documentation & architecture
│   ├── environment-variables.md # Comprehensive env var matrix & security rules
│   ├── handoff.md            # Multi-stage technical handoff notes & architecture
│   ├── pending-decisions.md  # Architectural & product decisions registry (DEC-001 - DEC-013)
│   └── security-review.md    # Security checklist & assessment (AUTH, RATE, CONS, SECR)
├── lib/                      # Shared client & server utilities
│   ├── admin/client.ts       # Browser helpers for admin API interactions
│   ├── auth/                 # SIWE helpers, address normalization, rate limiting
│   ├── drops/client.ts       # Drops & claims client API helpers
│   ├── inventory/            # Gifting client API helpers
│   ├── prisma.ts             # Prisma client singleton instance
│   ├── utils.ts              # cn helper (clsx + tailwind-merge)
│   └── wagmi.ts              # Wagmi v3 configuration & connectors
├── prisma/                   # Database schema and migrations
│   ├── schema.prisma         # 26-model PostgreSQL schema
│   └── migrations/           # PostgreSQL migration DDL scripts
├── scripts/                  # Standalone CLI tools & runners
│   ├── bootstrap-super-admin.ts # Out-of-band Super Admin initialization (Task B-3)
│   └── seed-initial-traits-and-drop.mjs # Local development seed runner
├── server/                   # Server-side business logic & services
│   ├── admin/                # Ban, abuse flags, drops, programs, OpenSea export services
│   ├── audit/                # Immutable PostgreSQL AuditLog service
│   ├── auth/                 # SIWE verification, nonce issues, session handling
│   ├── drops/                # Perpetual cycle schedule & atomic claim service
│   ├── inventory/            # Gifting rules, trait editions & avatar rendering
│   ├── social/               # Fail-closed Twitter/X OAuth PKCE service
│   ├── tasks/                # Campaign & task verification services
│   ├── whitelist/            # Whitelist qualification & queue promotion engines
│   └── db.ts                 # Server-isolated Prisma client access
└── tests/                    # Vitest automated test suite (1,124 tests)
    ├── admin/                # Admin service, route, and UI component tests
    ├── audit/                # AuditLog logging verification tests
    ├── auth/                 # SIWE, rate limit, and session security tests
    ├── cron/                 # Cron removal and event-driven promotion tests
    ├── drops/                # Drop cycles, claim engine, and concurrency tests
    ├── integration/          # End-to-end integration & DEC-012 verification tests
    ├── inventory/            # Gifting invariants and edition uniqueness tests
    ├── security/             # Security checklist assertion tests (AUTH, RATE, CONS, SECR)
    ├── social/               # Twitter/X OAuth flow tests
    ├── whitelist/            # WL qualification, queue order, and status tests
    └── pages.test.tsx        # Public pages English copy & render tests
```

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js `v20+`
- npm `v10+`
- PostgreSQL 15+ (local Docker or remote instance)

### 2. Clone & Install

```bash
git clone <repository-url>
cd "ChimpHood Site"
npm install
```

### 3. Environment Configuration (.env)

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

For detailed specifications of each environment variable, generation of secrets, and deployment checklists, see [Environment Variables Reference (docs/environment-variables.md)](./docs/environment-variables.md).

### 4. Validate & Generate Prisma Client

```bash
# Validate schema
npx prisma validate

# Generate TypeScript client
npm run prisma:generate
```

### 5. Super Admin Bootstrap (CLI)

Initialize the first Super Admin wallet securely out-of-band:

```bash
npm run admin:bootstrap -- 0xYourWalletAddressHere
```

### 6. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🧪 Verification & Testing Commands

| Command                | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `npx prisma validate`  | Check Prisma schema syntax and AST validity          |
| `npm run typecheck`    | Run TypeScript strict type-checking (`tsc --noEmit`) |
| `npm run lint`         | Run ESLint to verify code quality                    |
| `npm run test`         | Run entire unit & integration test suite with Vitest |
| `npm run build`        | Execute Next.js production build                     |
| `npm run format:check` | Verify code formatting with Prettier                 |

---

## 🔗 Further Documentation

- [Environment Variables Reference (docs/environment-variables.md)](./docs/environment-variables.md)
- [Technical Handoff Notes (docs/handoff.md)](./docs/handoff.md)
- [Pending Decisions Registry (docs/pending-decisions.md)](./docs/pending-decisions.md)
- [Security Review Checklist (docs/security-review.md)](./docs/security-review.md)

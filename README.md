# ChimpHood Site

Decentralized web platform for the ChimpHood ecosystem (Whitelist allocation, Web3 & social identity management, reward claims, and community campaigns).

---

## 📌 Project Status: Stage 1 (Data Model & Database Foundation)

The project is currently in **Stage 1**. The focus of this stage is designing 26 PostgreSQL data models using Prisma ORM v7, enforcing unique constraints, establishing low-latency query indexes, preparing an isolated initial SQL migration script for review, and maintaining the product decision registry.

> [!NOTE]
> Functional business modules (SIWE authentication, X OAuth, claim engine, gift engine, campaign engine, and active WL allocation) **are not yet implemented** and await Stage 2 & subsequent phases.
> Remote databases and production Supabase **are not modified** during this stage.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Language**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & PostCSS
- **Database ORM**: [Prisma](https://www.prisma.io/) v7 (PostgreSQL target via `prisma.config.ts`)
- **Code Quality**: ESLint (Next.js config) & Prettier
- **Testing**: [Vitest](https://vitest.dev/) & [React Testing Library](https://testing-library.com/)

---

## 📁 Directory Structure

```text
ChimpHood Site/
├── app/                      # Next.js App Router
│   ├── docs/page.tsx         # Documentation & Architecture overview
│   ├── profile/page.tsx      # User Profile & Identity framework
│   ├── whitelist/page.tsx    # Whitelist & Campaigns portal
│   ├── globals.css           # Tailwind CSS v4 config & theme styles
│   ├── layout.tsx            # Root layout with Navbar & Footer
│   └── page.tsx              # Home page
├── components/               # Modular UI components
│   ├── layout/               # Navbar, Footer
│   └── ui/                   # Button, Card, Badge, PlaceholderNotice
├── docs/                     # Technical documentation & architecture
│   ├── handoff.md            # Stage 1 technical handoff notes
│   └── pending-decisions.md  # Architectural & product decisions registry
├── lib/                      # Helpers & singleton client
│   ├── prisma.ts             # Prisma client singleton instance
│   └── utils.ts              # cn helper (clsx + tailwind-merge)
├── prisma/                   # Database schema and migrations
│   ├── schema.prisma         # 26-model PostgreSQL schema
│   └── migrations/           # Initial DDL SQL migration for review
├── server/                   # Server-side abstractions & DB entrypoint
│   └── db.ts                 # Server-isolated Prisma client access
├── tests/                    # Unit, component, and schema tests
│   ├── pages.test.tsx        # Page rendering and English copy tests
│   ├── placeholder.test.tsx  # Placeholder UI component tests
│   ├── schema.test.ts        # Schema specifications & Prisma client tests
│   └── setup.ts              # Vitest & jest-dom setup
├── .env.example              # Sanitized environment variables template
├── .gitignore                # Git ignore rules for secrets and build artifacts
├── next.config.mjs           # Next.js configuration
├── package.json              # Dependency management and scripts
├── postcss.config.mjs        # PostCSS Tailwind configuration
├── prisma.config.ts          # Prisma 7 datasource configuration
├── tsconfig.json             # TypeScript configuration
└── vitest.config.mts         # Vitest configuration
```

---

## 🚀 Getting Started

### 1. Prerequisites

- Node.js `v20+`
- npm `v10+`

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

### 5. Run Development Server

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
| `npm run test`         | Run unit & integration test suites with Vitest       |
| `npm run build`        | Execute Next.js production build                     |
| `npm run format:check` | Verify code formatting with Prettier                 |

---

## 🔗 Further Documentation

- [Environment Variables Reference (docs/environment-variables.md)](./docs/environment-variables.md)
- [Technical Handoff Notes (docs/handoff.md)](./docs/handoff.md)
- [Pending Decisions Registry (docs/pending-decisions.md)](./docs/pending-decisions.md)

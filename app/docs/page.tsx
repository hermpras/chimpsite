import React from "react";
import Link from "next/link";
import { BookOpen, FileCode, CheckCircle, HelpCircle, Layers } from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export default function DocsPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            ChimpHood Documentation
          </h1>
          <Badge variant="default">Stage 3</Badge>
        </div>
        <p className="text-gray-400">
          Technical documentation, system architecture, and product decisions registry.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="border-emerald-500/30">
          <CardHeader>
            <div className="mb-2 w-fit rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Layers className="h-5 w-5" />
            </div>
            <CardTitle>Architecture & Tech Stack</CardTitle>
            <CardDescription>Core technology foundation and tooling</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-gray-400">
            <p>• Framework: Next.js (App Router)</p>
            <p>• Language: TypeScript</p>
            <p>• Styling: Tailwind CSS v4</p>
            <p>• Database ORM: Prisma (PostgreSQL)</p>
            <p>• Testing: Vitest & React Testing Library</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 w-fit rounded-lg bg-blue-500/10 p-2 text-blue-400">
              <FileCode className="h-5 w-5" />
            </div>
            <CardTitle>Project Documentation</CardTitle>
            <CardDescription>Local markdown repositories</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-gray-400">
            <p>
              • <code className="text-emerald-400">README.md</code>: Quickstart &
              execution guide
            </p>
            <p>
              • <code className="text-emerald-400">docs/handoff.md</code>: Technical
              handoff notes
            </p>
            <p>
              • <code className="text-emerald-400">docs/pending-decisions.md</code>:
              Architecture decisions registry
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 w-fit rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <CardTitle>Decisions & Specifications</CardTitle>
            <CardDescription>Recorded product & technical architecture</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-gray-400">
            <p>• Web3 authentication & SIWE identity architecture</p>
            <p>• Off-chain claim & allocation execution</p>
            <p>• PostgreSQL 26-model schema & unique invariants</p>
            <p>• Gift transfer engine & anti-sybil protections</p>
          </CardContent>
        </Card>
      </div>

      {/* Deep-dive Document Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Development Roadmap</CardTitle>
          <CardDescription>
            Implementation roadmap across project development phases
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-3 space-y-6 border-l border-gray-800">
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-xs text-emerald-400">
                0
              </span>
              <h4 className="font-semibold text-emerald-400">
                Stage 0: Project Foundation & Documentation (Completed)
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                Setup Next.js, TypeScript, Tailwind CSS v4, ESLint, Prettier, Prisma
                scaffolding, Vitest, and technical handoff.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-xs text-emerald-400">
                1
              </span>
              <h4 className="font-semibold text-emerald-400">
                Stage 1: Data Model Specification & Database Foundation (Completed)
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                Designed 26 PostgreSQL models, relational constraints, performance
                indexing, Prisma 7 config, and initial migration DDL.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-xs text-emerald-400">
                2
              </span>
              <h4 className="font-semibold text-emerald-400">
                Stage 2: Authentication & Social Identity (Completed)
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                Implement SIWE (Sign-In with Ethereum) wallet authentication and session
                management.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-xs text-emerald-400">
                3
              </span>
              <h4 className="font-semibold text-emerald-400">
                Stage 3: Whitelist & Claim Engine (Current)
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                Quota allocation mechanisms, 5-trait category eligibility, 2-hour drop
                cycles, 30-minute claim windows, and duplicate gifting.
              </p>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

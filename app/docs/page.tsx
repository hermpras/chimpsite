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
          <Badge variant="default">Tahap 0</Badge>
        </div>
        <p className="text-gray-400">
          Dokumentasi teknis, arsitektur sistem, dan daftar keputusan produk yang
          tertunda.
        </p>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-3">
        <Card className="border-emerald-500/30">
          <CardHeader>
            <div className="mb-2 w-fit rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
              <Layers className="h-5 w-5" />
            </div>
            <CardTitle>Arsitektur & Tech Stack</CardTitle>
            <CardDescription>Fondasi teknologi yang digunakan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-gray-400">
            <p>• Framework: Next.js (App Router)</p>
            <p>• Bahasa: TypeScript</p>
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
            <CardTitle>Dokumen Proyek</CardTitle>
            <CardDescription>Arsip markdown lokal</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-gray-400">
            <p>
              • <code className="text-emerald-400">README.md</code>: Panduan cepat &
              instruksi run
            </p>
            <p>
              • <code className="text-emerald-400">docs/handoff.md</code>: Catatan handoff
              teknis
            </p>
            <p>
              • <code className="text-emerald-400">docs/pending-decisions.md</code>:
              Daftar keputusan terbuka
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="mb-2 w-fit rounded-lg bg-amber-500/10 p-2 text-amber-400">
              <HelpCircle className="h-5 w-5" />
            </div>
            <CardTitle>Pending Decisions</CardTitle>
            <CardDescription>Keputusan produk & teknis terbuka</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1 text-xs text-gray-400">
            <p>• Provider autentikasi Web3 / SIWE</p>
            <p>• Alur sesi dan penyimpanan token X OAuth</p>
            <p>• Finalisasi schema Data Model Prisma</p>
            <p>• Mekanisme on-chain vs off-chain Claim</p>
          </CardContent>
        </Card>
      </div>

      {/* Deep-dive Document Preview */}
      <Card>
        <CardHeader>
          <CardTitle>Tahap Selanjutnya (Roadmap)</CardTitle>
          <CardDescription>
            Urutan langkah pengerjaan setelah Tahap 0 selesai dan diverifikasi
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="relative ml-3 space-y-6 border-l border-gray-800">
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/20 text-xs text-emerald-400">
                0
              </span>
              <h4 className="font-semibold text-emerald-400">
                Tahap 0: Project Foundation & Documentation (Selesai)
              </h4>
              <p className="mt-1 text-sm text-gray-400">
                Setup Next.js, TypeScript, Tailwind, ESLint, Prettier, Prisma scaffolding,
                Vitest, dan dokumentasi handoff.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-400">
                1
              </span>
              <h4 className="font-semibold text-gray-300">
                Tahap 1: Data Model Specification & Database Migration
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                Review model entitas (User, Whitelist, Campaign, Claim), tetapkan relasi,
                dan eksekusi migration Prisma.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-400">
                2
              </span>
              <h4 className="font-semibold text-gray-300">
                Tahap 2: Authentication & Social Identity
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                Implementasi SIWE (Sign-In with Ethereum) dan X OAuth 2.0 PKCE.
              </p>
            </li>
            <li className="ml-6">
              <span className="absolute -left-3 flex h-6 w-6 items-center justify-center rounded-full border border-gray-700 bg-gray-800 text-xs text-gray-400">
                3
              </span>
              <h4 className="font-semibold text-gray-300">
                Tahap 3: Whitelist & Claim Engine
              </h4>
              <p className="mt-1 text-sm text-gray-500">
                Mekanisme alokasi kuota, verifikasi eligibility, dan claim token/gift.
              </p>
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

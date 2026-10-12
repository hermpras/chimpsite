import React from "react";
import Link from "next/link";
import { Shield, Sparkles, User, FileText, ArrowRight, CheckCircle2 } from "lucide-react";
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

export default function HomePage() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Hero Section */}
      <div className="mx-auto mb-16 flex max-w-3xl flex-col items-center space-y-6 text-center">
        <Badge variant="warning">Tahap 0: Foundation & Documentation</Badge>
        <h1 className="text-4xl font-black tracking-tight text-white sm:text-6xl">
          Welcome to <span className="text-emerald-400">ChimpHood</span>
        </h1>
        <p className="text-lg leading-relaxed text-gray-400">
          Platform komunitas web3 terdesentralisasi untuk alokasi Whitelist, verifikasi
          identitas, dan distribusi hadiah ekosistem.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link href="/whitelist">
            <Button size="lg" className="gap-2">
              Buka Whitelist <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <Link href="/docs">
            <Button variant="outline" size="lg">
              Baca Dokumentasi
            </Button>
          </Link>
        </div>
      </div>

      {/* Global Notice */}
      <div className="mb-12">
        <PlaceholderNotice
          title="Status Implementasi Saat Ini"
          description="Aplikasi berada pada Tahap 0. Modul autentikasi (SIWE, X OAuth), Claim Engine, Gift Engine, Campaign Tracker, dan Admin Logic belum diaktifkan dan ditandai sebagai placeholder sesuai instruksi master."
          phase="Tahap 0 Aktif"
        />
      </div>

      {/* Feature Navigation Cards */}
      <div className="mb-16 grid grid-cols-1 gap-6 md:grid-cols-3">
        {/* Whitelist Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <div className="mb-2 flex items-center justify-between">
                <div className="rounded-lg bg-emerald-500/10 p-2.5 text-emerald-400">
                  <Shield className="h-6 w-6" />
                </div>
                <Badge variant="warning">Kerangka</Badge>
              </div>
              <CardTitle>Whitelist Allocation</CardTitle>
              <CardDescription>
                Cek status kelayakan alokasi, tier whitelist, dan kriteria pendaftaran.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">
                Fitur pendaftaran dan claim engine sedang dalam persiapan model data.
              </p>
            </CardContent>
          </div>
          <div className="p-6 pt-0">
            <Link href="/whitelist" className="block w-full">
              <Button variant="secondary" className="w-full justify-between">
                Ke Halaman Whitelist <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>

        {/* Profile Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <div className="mb-2 flex items-center justify-between">
                <div className="rounded-lg bg-purple-500/10 p-2.5 text-purple-400">
                  <User className="h-6 w-6" />
                </div>
                <Badge variant="warning">Kerangka</Badge>
              </div>
              <CardTitle>User Profile</CardTitle>
              <CardDescription>
                Hubungkan wallet Web3 dan akun X (Twitter) untuk mengelola tier identitas.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">
                Fitur SIWE dan X OAuth 2.0 belum dikonfigurasi pada tahap ini.
              </p>
            </CardContent>
          </div>
          <div className="p-6 pt-0">
            <Link href="/profile" className="block w-full">
              <Button variant="secondary" className="w-full justify-between">
                Ke Profil <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>

        {/* Docs Card */}
        <Card className="flex flex-col justify-between">
          <div>
            <CardHeader>
              <div className="mb-2 flex items-center justify-between">
                <div className="rounded-lg bg-blue-500/10 p-2.5 text-blue-400">
                  <FileText className="h-6 w-6" />
                </div>
                <Badge variant="default">Tersedia</Badge>
              </div>
              <CardTitle>Dokumentasi Proyek</CardTitle>
              <CardDescription>
                Panduan arsitektur, handoff catatan teknis, dan pending decisions proyek.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-gray-500">
                Akses cepat ke panduan setup dan dokumen keputusan arsitektur.
              </p>
            </CardContent>
          </div>
          <div className="p-6 pt-0">
            <Link href="/docs" className="block w-full">
              <Button variant="secondary" className="w-full justify-between">
                Buka Docs <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </div>

      {/* Foundation Verification Overview */}
      <Card>
        <CardHeader>
          <CardTitle>Checklist Verifikasi Tahap 0</CardTitle>
          <CardDescription>
            Status fondasi teknis yang telah dikonfigurasi pada lingkungan kerja.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Next.js App Router (TypeScript)</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Tailwind CSS v4 & PostCSS</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>ESLint & Prettier configured</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Vitest & Testing Library setup</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Prisma Client (PostgreSQL target)</span>
            </div>
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <span>Repository Git & .env.example sanitized</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

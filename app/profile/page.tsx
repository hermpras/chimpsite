"use client";

import { User, Wallet, Shield, AlertTriangle } from "lucide-react";

function XLogo(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" {...props}>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 23.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}
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

export default function ProfilePage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Page Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">User Profile</h1>
          <Badge variant="warning">Kerangka Placeholder</Badge>
        </div>
        <p className="text-gray-400">
          Manajemen identitas terintegrasi Web3 Wallet dan akun X (Twitter).
        </p>
      </div>

      <div className="mb-8">
        <PlaceholderNotice
          title="Autentikasi Belum Aktif"
          description="Logika autentikasi Sign-In with Ethereum (SIWE) dan OAuth 2.0 untuk X sengaja dinonaktifkan pada Tahap 0 sampai arsitektur auth & sesi difinalisasi."
          phase="Tahap 0 Placeholder"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Wallet Connection Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <Wallet className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Web3 Wallet</CardTitle>
                <CardDescription>Status koneksi wallet pengguna</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-4 text-center">
              <p className="text-sm font-medium text-gray-400">Status: Belum Terhubung</p>
              <p className="mt-1 font-mono text-xs text-gray-500">
                0x000...0000 (Placeholder)
              </p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                alert("Fitur Connect Wallet belum diaktifkan (Placeholder Tahap 0).")
              }
            >
              Connect Wallet (Placeholder)
            </Button>
          </CardContent>
        </Card>

        {/* X (Twitter) Account Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-sky-500/10 p-2 text-sky-400">
                <XLogo className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>X (Twitter) Identity</CardTitle>
                <CardDescription>Status verifikasi akun sosial</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border border-dashed border-gray-700 bg-gray-900/40 p-4 text-center">
              <p className="text-sm font-medium text-gray-400">Status: Belum Terhubung</p>
              <p className="mt-1 text-xs text-gray-500">@username (Placeholder)</p>
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                alert("Fitur X OAuth belum diaktifkan (Placeholder Tahap 0).")
              }
            >
              Link Akun X (Placeholder)
            </Button>
          </CardContent>
        </Card>

        {/* Tier & Allocation Overview */}
        <Card className="md:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-500/10 p-2 text-purple-400">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Tingkat Komunitas (Tier Status)</CardTitle>
                  <CardDescription>
                    Status keanggotaan dan alokasi whitelist yang terkait akun Anda
                  </CardDescription>
                </div>
              </div>
              <Badge variant="outline">Tier Belum Ditetapkan</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4 text-sm text-gray-400">
              <p>
                Informasi tier, reward poin, dan whitelist balance akan ditampilkan di
                sini setelah schema database dan mekanisme alokasi disepakati.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

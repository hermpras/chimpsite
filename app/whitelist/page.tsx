"use client";

import React, { useState } from "react";
import { ShieldCheck, Search, Gift, Clock, Flame } from "lucide-react";
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

export default function WhitelistPage() {
  const [addressInput, setAddressInput] = useState("");

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight text-white">
            Whitelist Portal
          </h1>
          <Badge variant="warning">Kerangka Placeholder</Badge>
        </div>
        <p className="text-gray-400">
          Cek kelayakan alokasi, status pendaftaran, dan informasi distribusi ChimpHood
          Whitelist.
        </p>
      </div>

      <div className="mb-8">
        <PlaceholderNotice
          title="Claim Engine & Allocation Engine Dinonaktifkan"
          description="Logika verifikasi on-chain/off-chain, perhitungan kuota whitelist, dan klaim gift sengaja dinonaktifkan pada Tahap 0 sampai Data Model Specification dan mekanisme smart contract difinalisasi."
          phase="Tahap 0 Placeholder"
        />
      </div>

      <div className="space-y-6">
        {/* Whitelist Checker Tool (Placeholder) */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-emerald-500/10 p-2 text-emerald-400">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Cek Status Alokasi Whitelist</CardTitle>
                <CardDescription>
                  Masukkan alamat wallet EVM atau akun X untuk memeriksa status alokasi
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="text"
                placeholder="0x... atau @handle (Placeholder UI)"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                className="flex-1 rounded-lg border border-gray-700 bg-gray-900/60 px-4 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-emerald-500 focus:outline-none"
              />
              <Button
                variant="primary"
                onClick={() =>
                  alert(
                    "Pencarian alokasi belum aktif (Placeholder Tahap 0). Menunggu penetapan model data alokasi.",
                  )
                }
              >
                Cek Kelayakan (Placeholder)
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              * Data alokasi aktual akan bersumber dari database PostgreSQL dan Merkle
              Tree verifikasi pada tahap berikutnya.
            </p>
          </CardContent>
        </Card>

        {/* Campaign & Tasks Placeholder */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-amber-500/10 p-2 text-amber-400">
                  <Flame className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Campaigns & Quests</CardTitle>
                  <CardDescription>
                    Misi komunitas untuk memperoleh alokasi
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2">
                  <span>Quest Komunitas Early Bird</span>
                  <Badge variant="outline">Mendatang</Badge>
                </div>
                <div className="flex items-center justify-between border-b border-gray-800 py-2">
                  <span>Kampanye Kreatif Konten X</span>
                  <Badge variant="outline">Mendatang</Badge>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span>Misi Referral ChimpHood</span>
                  <Badge variant="outline">Mendatang</Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-500/10 p-2 text-teal-400">
                  <Gift className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle>Gift / Referral Allocation</CardTitle>
                  <CardDescription>Distribusi alokasi hadiah</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 rounded-lg border border-gray-800 bg-gray-900/40 p-4 text-sm text-gray-400">
                <p>
                  Mekanisme pembagian hadiah (Gift Engine) antar member masih dalam
                  status:{" "}
                  <span className="font-semibold text-amber-300">PENDING DECISION</span>.
                </p>
                <Button variant="outline" size="sm" className="w-full" disabled>
                  Klaim Gift (Belum Aktif)
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

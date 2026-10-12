# Technical Handoff Document: Tahap 0

**Tanggal**: 13 Oktober 2026  
**Status**: Tahap 0 Selesai (Project Foundation & Documentation)  
**Workspace**: `/Users/hermawanprastiyanto/Desktop/ChimpHood Site`

---

## 1. Ringkasan Eksekutif

Tahap 0 bertujuan untuk mendirikan fondasi teknis yang kokoh, terstandardisasi, dan terdokumentasi tanpa mengimplementasikan logika bisnis prematur atau membuat migrasi database final sebelum spesifikasi disepakati. Seluruh modul yang belum aktif telah ditandai secara visual dan struktural sebagai placeholder.

---

## 2. Arsitektur & Tech Stack

| Komponen            | Pilihan Teknologi        | Versi            | Catatan                                 |
| ------------------- | ------------------------ | ---------------- | --------------------------------------- |
| **Framework**       | Next.js (App Router)     | ^16.x / React 19 | Standard React Server Components        |
| **Bahasa**          | TypeScript               | ^5.x/6.x         | Strict type-checking diaktifkan         |
| **CSS & Design**    | Tailwind CSS & PostCSS   | ^4.x             | Dark-first theme dengan CSS variables   |
| **Database ORM**    | Prisma                   | ^7.x             | Target database PostgreSQL              |
| **Testing**         | Vitest & Testing Library | ^4.x             | Pengujian berbasis jsdom                |
| **Code Formatting** | Prettier                 | ^3.x             | Prettier tailwind plugin terkonfigurasi |
| **Linting**         | ESLint                   | ^9.x             | Next.js core web vitals ruleset         |

---

## 3. Struktur Direktori & Tanggung Jawab

- **`app/`**: Rute aplikasi Next.js App Router.
  - `/`: Beranda utama dengan kartu navigasi dan status proyek.
  - `/whitelist`: Halaman alokasi dan pemeriksaan whitelist (placeholder).
  - `/profile`: Halaman akun, status wallet, dan identitas sosial (placeholder).
  - `/docs`: Halaman ringkasan dokumentasi dan roadmap.
  - `globals.css`: Konfigurasi styling Tailwind v4 dan variabel tema.
- **`components/`**: Komponen UI yang dapat digunakan kembali.
  - `layout/`: Navbar dan Footer terintegrasi.
  - `ui/`: Badge, Button, Card, dan PlaceholderNotice.
- **`lib/`**: Utilitas umum dan inisialisasi singleton.
  - `prisma.ts`: Singleton instance PrismaClient untuk mencegah koneksi ganda di lingkungan pengembangan.
  - `utils.ts`: Utilitas `cn()` penggabung class Tailwind CSS.
- **`server/`**: Abstraksi logika server-side dan database.
  - `db.ts`: Re-export PrismaClient yang aman untuk server.
- **`prisma/`**:
  - `schema.prisma`: Konfigurasi PostgreSQL draf tanpa schema migrasi final.
- **`tests/`**:
  - Setup dan suite pengujian unit untuk komponen UI dan rendering halaman kerangka.
- **`docs/`**:
  - `handoff.md`: Dokumen handoff teknis ini.
  - `pending-decisions.md`: Daftar inventaris keputusan produk dan arsitektur yang tertunda.

---

## 4. Status Implementasi Saat Ini

| Fitur / Modul                              | Status         | Catatan                                             |
| ------------------------------------------ | -------------- | --------------------------------------------------- |
| Git Inisialisasi & `.gitignore`            | ✅ Selesai     | Branch `main`, secrets/build terisolasi             |
| Konfigurasi Tooling (TS, Lint, Prettier)   | ✅ Selesai     | Lulus typecheck & lint                              |
| Pengujian Otomatis (Vitest)                | ✅ Selesai     | Test suite lulus                                    |
| Scaffolding Prisma Client                  | ✅ Selesai     | Client ter-generate; **tidak ada migrasi database** |
| Halaman Kerangka (Home, Profile, WL, Docs) | ✅ Selesai     | Navigasi aktif; interaksi berlabel placeholder      |
| Sanitasi Lingkungan (`.env.example`)       | ✅ Selesai     | Hanya variabel kosong & placeholder                 |
| Autentikasi SIWE / Wallet                  | ⏸️ Placeholder | Dibatasi hingga tahap autentikasi                   |
| X (Twitter) OAuth 2.0                      | ⏸️ Placeholder | Dibatasi hingga tahap autentikasi                   |
| Claim Engine / Gift Engine                 | ⏸️ Placeholder | Menunggu Data Model Specification                   |
| Admin Logic & Allocation Engine            | ⏸️ Placeholder | Menunggu Data Model Specification                   |

---

## 5. Instruksi Menjalankan & Verifikasi

### Menjalankan Server Lokal

```bash
npm run dev
```

Akses di `http://localhost:3000`.

### Verifikasi Mandiri

```bash
# 1. Typecheck
npm run typecheck

# 2. Linting
npm run lint

# 3. Pengujian Unit
npm run test

# 4. Production Build
npm run build
```

---

## 6. Langkah Lanjutan (Next Steps: Tahap 1)

1. **Review Data Model Specification**:
   - Definisikan model relasional: `User`, `Wallet`, `SocialAccount`, `WhitelistAllocation`, `Campaign`, `ClaimTransaction`.
2. **Setup Instance PostgreSQL**:
   - Hubungkan database lokal atau cloud (misal Neon / Supabase / Docker PostgreSQL).
3. **Eksekusi Migrasi Prisma Pertama**:
   - Jalankan `npx prisma migrate dev --name init_schema` setelah model data disetujui.
4. **Implementasi Session Store**:
   - Pilih arsitektur session auth (misalnya Auth.js / Iron Session) sesuai keputusan pada `pending-decisions.md`.

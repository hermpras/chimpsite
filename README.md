# ChimpHood Site

Platform web terdesentralisasi untuk ekosistem ChimpHood (alokasi Whitelist, manajemen identitas Web3 & sosial, klaim hadiah, dan kampanye komunitas).

---

## 📌 Status Proyek: Tahap 0 (Project Foundation & Documentation)

Proyek saat ini berada di **Tahap 0**. Fokus tahap ini adalah penyiapan fondasi teknis, struktur direktori, linting, testing, ORM scaffolding, serta pencatatan keputusan produk.

> [!NOTE]
> Fitur autentikasi (SIWE, X OAuth), claim engine, gift engine, alokasi WL on-chain, dan admin logic **belum diaktifkan** dan berstatus **Placeholder** sesuai batasan Tahap 0.

---

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (App Router, React 19)
- **Bahasa**: [TypeScript](https://www.typescriptlang.org/) (Strict mode)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/) & PostCSS
- **Database ORM**: [Prisma](https://www.prisma.io/) (PostgreSQL target)
- **Code Quality**: ESLint (Next.js config) & Prettier
- **Testing**: [Vitest](https://vitest.dev/) & [React Testing Library](https://testing-library.com/)

---

## 📁 Struktur Direktori

```text
ChimpHood Site/
├── app/                      # Next.js App Router
│   ├── docs/page.tsx         # Kerangka Dokumentasi & Arsitektur
│   ├── profile/page.tsx      # Kerangka Halaman Profil Pengguna
│   ├── whitelist/page.tsx    # Kerangka Halaman Whitelist & Kampanye
│   ├── globals.css           # Konfigurasi Tailwind CSS v4 & theme
│   ├── layout.tsx            # Root layout dengan Navbar & Footer
│   └── page.tsx              # Halaman Beranda (Home)
├── components/               # Komponen UI modular
│   ├── layout/               # Navbar, Footer
│   └── ui/                   # Button, Card, Badge, PlaceholderNotice
├── docs/                     # Dokumentasi teknis & arsitektur
│   ├── handoff.md            # Catatan handoff teknis Tahap 0
│   └── pending-decisions.md  # Keputusan produk/teknis yang belum final
├── lib/                      # Helper & singleton client
│   ├── prisma.ts             # Prisma client singleton instance
│   └── utils.ts              # cn helper (clsx + tailwind-merge)
├── prisma/                   # Skema dan konfigurasi database
│   └── schema.prisma         # Skema draf PostgreSQL (tanpa migrasi final)
├── server/                   # Server-side abstractions & DB entrypoint
│   └── db.ts                 # Akses prisma terisolasi server
├── tests/                    # Pengujian unit & integrasi dasar
│   ├── navigation.test.tsx   # Pengujian render halaman
│   ├── placeholder.test.tsx  # Pengujian komponen placeholder
│   └── setup.ts              # Setup Vitest & jest-dom
├── .env.example              # Template variabel lingkungan aman
├── .gitignore                # Aturan ignore secret dan build artifacts
├── next.config.mjs           # Konfigurasi Next.js
├── postcss.config.mjs        # Konfigurasi PostCSS Tailwind
├── eslint.config.mjs         # Konfigurasi ESLint Flat Config
├── tsconfig.json             # Konfigurasi TypeScript
├── vitest.config.ts          # Konfigurasi Vitest
└── package.json              # Manajemen dependensi dan script
```

---

## 🚀 Memulai (Instruksi Menjalankan Aplikasi)

### 1. Prasyarat

- Node.js `v20+`
- npm `v10+`

### 2. Kloning & Instalasi

```bash
git clone <repository-url>
cd "ChimpHood Site"
npm install
```

### 3. Konfigurasi Lingkungan (.env)

Salin `.env.example` ke `.env.local`:

```bash
cp .env.example .env.local
```

Sesuaikan nilai `DATABASE_URL` jika sudah memiliki instance PostgreSQL lokal. _(Catatan: Koneksi database aktif belum diwajibkan untuk menjalankan kerangka UI Tahap 0)._

### 4. Generate Prisma Client

```bash
npm run prisma:generate
```

### 5. Menjalankan Server Pengembangan

```bash
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000) pada browser Anda.

---

## 🧪 Perintah Verifikasi & Testing

| Perintah               | Deskripsi                                             |
| ---------------------- | ----------------------------------------------------- |
| `npm run lint`         | Menjalankan ESLint untuk memeriksa kualitas kode      |
| `npm run typecheck`    | Menjalankan TypeScript type checking (`tsc --noEmit`) |
| `npm run test`         | Menjalankan unit tests dengan Vitest                  |
| `npm run build`        | Melakukan production build Next.js                    |
| `npm run format:check` | Memeriksa format kode dengan Prettier                 |

---

## 📑 Halaman Kerangka yang Tersedia

1. **Home (`/`)**: Ringkasan platform, call-to-action navigasi, dan checklist verifikasi Tahap 0.
2. **Whitelist (`/whitelist`)**: Kerangka pengecekan alokasi whitelist, ringkasan quest/campaign, dan alokasi gift.
3. **Profile (`/profile`)**: Kerangka manajemen wallet Web3, akun X, dan status tingkatan (tier).
4. **Docs (`/docs`)**: Dokumentasi interaktif mengenai tech stack, roadmap, dan pending decisions.

---

## 🔗 Dokumentasi Lanjutan

- [Catatan Handoff (docs/handoff.md)](./docs/handoff.md)
- [Pending Decisions (docs/pending-decisions.md)](./docs/pending-decisions.md)

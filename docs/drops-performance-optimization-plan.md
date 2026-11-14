# Elychimp Drops — Performance Optimization & Scalability Implementation Plan

**Document Version**: 1.0.0  
**Date**: November 14, 2026  
**Status**: APPROVED PLAN — READY FOR PHASED EXECUTION  
**Scope**: Trait Drops & Lootbox Engine (`/drops`, `/api/drops/*`)  
**Product**: Elychimp  
**Network**: Elysium  
**Target Environment**: Staging & Production (Vercel Serverless + Supabase PostgreSQL + Upstash Redis)  

---

## 1. Executive Summary & Constraints

### 1.1 Background & Objective
Sistem **Elychimp Drops** dirancang untuk mendistribusikan *mystery crate trait items* setiap siklus 2 jam dengan kuota 250 unit per siklus. Audit arsitektur menunjukkan bahwa integritas data klaim dan pencegahan *overselling* sudah sangat aman melalui transaksi atomik PostgreSQL (`prisma.$transaction`). Namun, modul pembacaan publik (`GET /api/drops/current`) dan manajemen koneksi database memiliki kerentanan performa kritis (*bottlenecks*) ketika ratusan pengguna mengakses halaman `/drops` secara bersamaan atau saat hitungan mundur (*countdown*) mencapai `00:00:00`.

Rencana implementasi ini menyusun langkah-langkah optimasi bertahap untuk menstabilkan performa dan kapasitas konkurensi sistem Drops dengan tetap mempertahankan aturan bisnis, kelayakan whitelist, dan integritas persediaan (*stock invariants*).

### 1.2 Service Limits & Cost Boundaries
Seluruh solusi optimasi dirancang dengan batasan ketat tanpa penambahan biaya:
- **Supabase Free Tier**: Batas koneksi langsung sangat terbatas (kuota pool direct connection terbatas). Sumber kebenaran mutlak data tetap berada pada PostgreSQL.
- **Vercel Hobby (Free Tier)**:
  - Batas eksekusi serverless function: 10–15 detik.
  - Vercel Cron pada tier Hobby dibatasi hanya **1 eksekusi per hari**. Oleh karena itu, scheduler eksternal setiap 2 jam dilarang menggunakan Vercel Cron.
- **Upstash Redis (Existing)**: Menggunakan instance Redis Upstash yang telah aktif pada proyek (`UPSTASH_REDIS_REST_URL` & `UPSTASH_REDIS_REST_TOKEN`).
- **Nol Biaya Tambahan ($0 USD)**: Tidak ada upgrade ke paket berbayar (Supabase Pro / Vercel Pro) dan tidak ada penambahan layanan pihak ketiga baru.

---

## 2. Technical Decision Record (TDR)

Berikut adalah catatan keputusan teknis resmi yang telah disetujui:

### TDR-001: Supabase Shared Transaction Pooler (Port 6543) & Pool Size = 1
- **Keputusan**: Mengarahkan koneksi runtime produksi/staging ke port Supavisor Transaction Pooler (`6543`) dan menurunkan kapasitas pool koneksi lokal per instance serverless (`max: 1`).
- **Rasional**: Pada Vercel Serverless, setiap instance kontainer lambda menjalankan proses Node.js independen. Jika pool size bernilai 10 dan terdapat 50 kontainer lambda aktif bersamaan, aplikasi akan meminta 500 koneksi ke database, yang langsung melampaui kapasitas koneksi Supabase Free. Dengan `max: 1` per instance dipadukan dengan Transaction Pooler pada port 6543, koneksi database segera dikembalikan ke pooler begitu query/transaksi selesai.
- **Batasan & Aturan**:
  - Prisma Client menggunakan driver adapter `@prisma/adapter-pg` bersama `pg.Pool`.
  - **Dilarang** menambahkan parameter `?pgbouncer=true` secara sembarangan pada connection string driver adapter modern tanpa verifikasi parser URL, karena adapter Prisma modern menangani transaksi melalui protokol Postgres native `pg.Pool`.

### TDR-002: Redis Distributed Lock untuk Lazy Auto-Replenishment
- **Keputusan**: Menerapkan *distributed lock* berbasis Upstash Redis pada fungsi inisialisasi siklus baru (`ensureActiveCyclePeriod`) dengan mekanisme token acak unik dan rilis aman via Lua script. Menolak penggunaan Vercel Hobby Cron untuk jadwal 2 jam.
- **Rasional**: Vercel Hobby hanya mengizinkan 1 cron run per hari. Mempertahankan lazy replenishment saat request pertama tiba adalah pendekatan zero-cost yang tepat, asalkan dilindungi oleh distributed lock agar tidak terjadi *thundering herd* mutasi data ketika puluhan user masuk pada detik ke-0 siklus baru.
- **Batasan & Aturan**:
  - Lock menggunakan TTL terikat (misalnya 15 detik).
  - Rilis lock memverifikasi token kepemilikan (`if redis.get(key) == token then del(key)`).
  - Database unique constraint `@@unique([dropId, periodIndex])` tetap menjadi jaring pengaman akhir (*idempotency guard*).
  - Jika Redis tidak dapat diakses, request publik tidak boleh melakukan mutasi liar; request harus menunggu dalam status standby sampai periode siap.

### TDR-003: Scoped Historical Query pada Endpoint Drops
- **Keputusan**: Menghapus `include: { periods: { ... } }` tanpa batas pada kueri `prisma.drop.findFirst`. Mengambil data periode secara terisolasi hanya untuk periode aktif saat ini (`startsAt <= now <= endsAt`) dan periode mendatang yang dibutuhkan untuk countdown.
- **Rasional**: Mencegah penarikan ribuan baris riwayat `DropPeriod` dan `DropPoolItem` masa lalu ke memori kontainer Node.js. Mengurangi beban payload memori dari puluhan megabyte menjadi beberapa kilobyte per request.
- **Batasan & Aturan**: Kueri 8 riwayat unboxing terbaru (`recentPulls`) tetap dipertahankan melalui kueri terpisah yang diindeks pada `Claim` (`status = SUCCESS, dropId = drop.id`).

### TDR-004: Pemisahan Data Publik dan Privat (Edge Caching)
- **Keputusan**: Memisahkan respons data publik (detail drop, periode aktif, probabilitas, stok display, unboxing terbaru) dari data privat spesifik pengguna (`userEligibility`, `userHasClaimed`).
- **Rasional**: Data publik dapat di-cache di Vercel Edge Network menggunakan header `Cache-Control: public, s-maxage=5, stale-while-revalidate=10`. Selama 5 detik, ratusan pengunjung bersamaan akan dilayani langsung dari CDN Edge tanpa menyentuh serverless function atau database. Data privat diambil melalui endpoint terpisah (`/api/drops/user-status`) dengan `Cache-Control: private, no-store`.
- **Batasan & Aturan**:
  - Data privat pengguna **dilarang keras** masuk ke dalam shared cache publik.
  - Tampilan sisa stok pada UI publik diperbolehkan sedikit tertinggal beberapa detik (*eventual consistency*), namun endpoint transaksi klaim (`POST /api/drops/claim`) **wajib** selalu memverifikasi stok aktual secara real-time langsung ke PostgreSQL.

### TDR-005: Batch Query untuk Validasi Kelayakan Tugas (`taskProgress`)
- **Keputusan**: Mengubah kueri iteratif N+1 pada `checkUserDropEligibility` menjadi satu kueri *batch* `findMany` dengan operator `in: mandatoryTaskIds`.
- **Rasional**: Menghilangkan 5–10 query sekuensial terpisah per evaluasi kelayakan. Mempercepat waktu eksekusi evaluasi kelayakan hingga >85%.
- **Batasan & Aturan**: Seluruh logika evaluasi boolean (persyaratan dompet, X identity, kelengkapan tugas kampanye, status ban, dan larangan bagi pemegang slot WL) tidak boleh berubah.

### TDR-006: Random Client Countdown Jitter (500–2500 ms)
- **Keputusan**: Menambahkan penundaan acak (*random jitter*) antara 500ms hingga 2500ms pada fungsi auto-refresh di sisi browser ketika countdown timer menyentuh angka nol.
- **Rasional**: Mendistribusikan gelombang request klien agar tidak menghantam server pada milidetik yang sama saat terjadi pergantian siklus periode.
- **Batasan & Aturan**: Tidak menggunakan polling database agresif.

### TDR-007: Penundaan Optimasi P2 (React Query & Redis List)
- **Keputusan**: Menunda integrasi React Query untuk state Drops dan penyimpanan recent unboxings pada Redis List sampai tahapan P0 dan P1 selesai diuji di Staging.
- **Rasional**: Menjaga cakupan perubahan tetap terisolasi dan terukur.

---

## 3. Phased Implementation Roadmap

Urutan pengerjaan bersifat mutlak dan berurutan:  
**P0.1 -> P0.2 -> P0.3 -> P1.1 -> P1.2 -> P1.3 -> P2**

```
┌────────────────────────────────────────────────────────┐
│  P0.1: Scoped Historical Query                         │
│  Eliminasi pengambilan seluruh riwayat periode di DB   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  P0.2: Database Connection Tuning                      │
│  Supabase Transaction Pooler (Port 6543) & Max Pool 1  │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  P0.3: Redis Distributed Lock Auto-Replenish           │
│  Mencegah Thundering Herd mutasi siklus baru           │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  P1.1: Public / Private Data Separation & Edge Cache   │
│  Edge cache (s-maxage=5) untuk data publik drop        │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  P1.2: Batch Eligibility Query                         │
│  Eliminasi kueri N+1 pada pengecekan taskProgress      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  P1.3: Countdown Rollover Jitter                       │
│  Penyebaran request klien 500-2500ms saat timer 0      │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│  P2: Deferred Optimizations (Evaluated Post-Metrics)   │
│  React Query & Redis Unboxings List                    │
└────────────────────────────────────────────────────────┘
```

---

## 4. Detailed Stage-by-Stage Implementation Specifications

### Phase P0.1 — Scoped Historical Query
- **Status**: `COMPLETED`
- **Tujuan**: Membatasi query `periods` pada `GET /api/drops/current` agar hanya mengambil periode yang aktif dan relevan, bukan seluruh riwayat periode masa lalu.
- **Ringkasan Perubahan**:
  1. Mengubah `prisma.drop.findFirst` dan `prisma.drop.update` menjadi kueri ramping tanpa include `periods` (*unbounded historical fetch eliminated*).
  2. Mengambil periode aktif secara terisolasi via kueri yang diindeks:
     ```ts
     const activePeriod = await prisma.dropPeriod.findFirst({
       where: {
         dropId: drop.id,
         startsAt: { lte: now },
         endsAt: { gte: now },
       },
       orderBy: { startsAt: "desc" },
       include: {
         poolItems: {
           include: { trait: true },
         },
       },
     });
     ```
  3. Mengambil periode berikutnya secara time-scoped (`startsAt > activePeriod.startsAt` atau `startsAt > now`, `orderBy: { startsAt: "asc" }`) untuk menyuplai countdown siklus masa depan.
  4. Menyediakan fallback perhitungan `nextCycle` berbasis durasi siklus (`activePeriod.endsAt + cycleDurationMs`) jika periode berikutnya belum digenerate di database.
  5. Mempertahankan respons standby yang aman saat `activePeriod` null (`periodActive: false`) dengan data `nextCycle`.
  6. Mempertahankan kueri `recentPulls` independen pada `Claim` (`status = SUCCESS, dropId = drop.id`).
- **Daftar File yang Diubah**:
  - `app/api/drops/current/route.ts`
  - `tests/drops/current-route.test.ts`
  - `docs/drops-performance-optimization-plan.md`
- **Hasil Testing**:
  - `tests/drops/current-route.test.ts`: **15/15 passed** (3 baseline tests + 7 initial P0.1 tests + 5 edge-case hardening tests).
  - Seluruh suite Drops (`tests/drops/`): **13 test files / 156 tests passed (100%)**.
  - TypeScript Typecheck (`npm run typecheck`): **0 errors (Pass)**.
  - ESLint (`npx eslint`): **0 errors, 0 warnings (Pass)**.
- **Kriteria Keberhasilan**:
  - [x] Struktur respons API JSON 100% kompatibel dengan frontend `app/drops/page.tsx` (`CurrentDropResponse`).
  - [x] Baris `DropPeriod` yang dimuat dari database berkurang dari seluruh riwayat masa lalu menjadi maksimal 1–2 periode per request.
  - [x] Stok, probabilitas, dan data pool items tidak mengalami perubahan nilai.
  - [x] Kondisi rollover dan ketiadaan periode masa depan tertangani dengan aman tanpa error.
  - [x] Pemilihan `nextPeriod` terlindungi dari periode overlapping dan periode `CANCELLED`.
- **Risiko & Keterbatasan**:
  - Rendah. Logika bisnis kelayakan, auto-replenish, dan kueri unboxing tidak tersentuh.
- **Catatan Rollback**:
  - `git restore app/api/drops/current/route.ts tests/drops/current-route.test.ts`
- **P0.1 Edge Case Hardening Implementation (Nov 14, 2026)**:
  - **Perubahan Query**:
    ```ts
    where: {
      dropId: drop.id,
      startsAt: activePeriodEndsAt ? { gte: activePeriodEndsAt } : { gt: now },
      status: { not: "CANCELLED" as const },
    }
    ```
  - **Alasan Pemilihan Operator Waktu**:
    - Saat `activePeriod` aktif: Periode berikutnya berurutan langsung dari akhir periode aktif. Karena periode berikutnya dimulai tepat pada detik/milidetik berakhirnya periode aktif (`nextStartsAt === activePeriodEndsAt = 12:00:00.000Z`), operator wajib menggunakan `gte: activePeriodEndsAt`. Hal ini secara otomatis menolak seluruh periode overlapping/anomali yang dimulai sebelum `activePeriodEndsAt`.
    - Saat `activePeriod` kosong: Setiap periode mendatang yang dicari harus benar-benar berada di masa depan terhadap waktu request saat ini (`startsAt: { gt: now }`).
  - **Perlakuan Status Periode**:
    - Menyertakan klausul `status: { not: "CANCELLED" }` baik pada kueri database maupun in-memory test fallback, memastikan periode yang dibatalkan oleh admin tidak pernah terpilih sebagai target countdown berikutnya.
  - **Uji Rollover Milidetik Tepat**:
    - Memverifikasi perilaku pergantian periode tepat pada `12:00:00.000Z` dengan fake timers: `orderBy: { startsAt: "desc" }` secara deterministik memilih periode baru sebagai `activePeriod`, dan `nextPeriod` mengambil periode berikutnya lagi (`startsAt >= 14:00:00.000Z`).
  - **Status P0.1**: `HARDENED, TESTED, & COMPLETED`.
- **Status Tahap Berikutnya**:
  - **P0.2 (Database Connection Tuning: Port 6543 & Pool Max 1)**: `READY FOR REVIEW & APPROVAL`. Pengerjaan menunggu konfirmasi pengguna.

---

### Phase P0.2 — Database Connection Tuning (Port 6543 & Pool = 1)
- **Tujuan**: Mengonfigurasi `lib/prisma.ts` agar aman berjalan pada Vercel Serverless tanpa memicu *connection pool exhaustion* di Supabase Free.
- **File Terdampak**:
  - `lib/prisma.ts`
  - Dokumentasi environment variable (`docs/environment-variables.md`)
- **Kondisi Saat Ini**:
  - `lib/prisma.ts` baris 15–17 menetapkan default `maxConnections = 10` jika `DATABASE_POOL_MAX` tidak diatur.
  - Runtime serverless berpotensi membuka hingga 10 koneksi per instance container.
- **Perubahan yang Diperlukan**:
  1. Sesuaikan default connection pool di `lib/prisma.ts`:
     ```ts
     const defaultPoolMax = process.env.NODE_ENV === "production" ? 1 : 10;
     const maxConnections = process.env.DATABASE_POOL_MAX
       ? parseInt(process.env.DATABASE_POOL_MAX, 10)
       : defaultPoolMax;
     ```
  2. Dokumentasikan instruksi konfigurasi `DATABASE_URL` staging/produksi agar mengarah ke port Supavisor Transaction Pooler (`6543`).
  3. Verifikasi bahwa Prisma 7 driver adapter (`@prisma/adapter-pg`) berjalan lancar dengan pool size 1 dan mode transaction tanpa parameter non-standar.
- **Dependency**: P0.1 selesai.
- **Risiko & Potensi Regresi**: Sedang. Pengaturan pool = 1 dapat menyebabkan antrean kueri lokal jika satu serverless function mengeksekusi banyak kueri lambat secara sekuensial. Hal ini diatasi melalui optimasi P0.1 dan P1.2.
- **Test Wajib**:
  - `npm run test tests/prisma-singleton.test.ts`
  - `npm run test tests/drops/claim.test.ts`
  - `npm run test tests/drops/claim-concurrency.test.ts`
- **Kriteria Keberhasilan**:
  - Semua unit test dan concurrency test lolos tanpa error koneksi database.
  - Tidak terjadi kebocoran koneksi idle di database.
- **Cara Rollback**: Naikkan kembali nilai `DATABASE_POOL_MAX` melalui environment variable atau kembalikan kode `lib/prisma.ts`.

---

### Phase P0.3 — Redis Distributed Lock Auto-Replenish
- **Tujuan**: Mencegah benturan konkurensi (*race condition*) dan lonjakan beban database saat inisialisasi siklus baru dibuka.
- **File Terdampak**:
  - `server/drops/auto-replenish.ts`
  - `app/api/drops/current/route.ts`
  - Modul lock Redis baru di `lib/redis/lock.ts` (menggunakan client Upstash Redis yang sudah ada)
- **Kondisi Saat Ini**:
  - `ensureActiveCyclePeriod` dipanggil langsung di `GET /api/drops/current` baris 98 ketika periode belum ada.
  - Ratusan request yang tiba bersamaan saat countdown 0 akan serentak mencoba melakukan update dan create ke database.
- **Perubahan yang Diperlukan**:
  1. Buat utilitas distributed lock berbasis Upstash Redis (`acquireLock(key, ttlSeconds)` dan `releaseLock(key, token)` via Lua script).
  2. Pada alur replenishment `GET /api/drops/current`:
     - Periksa apakah periode aktif sudah ada di database.
     - Jika belum ada, coba peroleh lock: `lock:drop-replenish:${drop.id}:${periodIndex}` dengan TTL 15 detik.
     - Jika lock berhasil didapatkan:
       - Lakukan *double-check* ke database (pola *Double-Checked Locking*).
       - Jika tetap belum ada, eksekusi `ensureActiveCyclePeriod`.
       - Rilis lock dengan aman menggunakan token kepemilikan.
     - Jika lock gagal didapatkan (proses lain sedang melakukan replenishment):
       - Jangan lakukan mutasi ke database.
       - Kembalikan respons *standby* dengan aman (`active: true, periodActive: false, message: "Drop cycle initializing. Please standby."`).
     - Jika Redis offline/gagal:
       - Tangani error dengan anggun, jangan izinkan mutasi tak terkontrol dari banyak request publik.
- **Dependency**: P0.2 selesai.
- **Risiko & Potensi Regresi**: Sedang. Klien yang masuk saat replenishment berlangsung akan menerima status standby selama 1–2 detik hingga periode siap.
- **Test Wajib**:
  - `npm run test tests/drops/auto-replenish.test.ts`
  - `npm run test tests/drops/current-route.test.ts`
- **Kriteria Keberhasilan**:
  - Saat simulasi request konkuren, hanya tepat 1 proses yang mengeksekusi operasi insert/update ke database.
  - Tidak ada duplicate key error pada unique constraint `[dropId, periodIndex]`.
- **Cara Rollback**: Nonaktifkan pemanggilan lock melalui bypass flag atau kembalikan file terkait via git.

---

### Phase P1.1 — Public and Private Data Separation & Edge Caching
- **Tujuan**: Melindungi database dari lonjakan trafik pengunjung dengan meng-cache data publik di Edge CDN dan memisahkan data privat pengguna.
- **File Terdampak**:
  - `app/api/drops/current/route.ts`
  - `app/api/drops/user-status/route.ts` (endpoint baru khusus data pengguna terautentikasi)
  - `lib/drops/client.ts`
  - `app/drops/page.tsx`
- **Kondisi Saat Ini**:
  - `GET /api/drops/current` menggabungkan data publik (drop, period, probabilities, recent pulls) dengan data privat (`userEligibility`, `userHasClaimed`) dalam satu response dengan header `revalidate = 0, dynamic = "force-dynamic"`.
- **Perubahan yang Diperlukan**:
  1. Ubah `GET /api/drops/current` menjadi endpoint murni data publik:
     - Hapus lookup `authenticateRequest` dan `checkUserDropEligibility` dari route ini.
     - Tambahkan response header: `Cache-Control: public, s-maxage=5, stale-while-revalidate=10`.
  2. Buat endpoint baru `GET /api/drops/user-status`:
     - Mengambil sesi autentikasi pengguna (`authenticateRequest`).
     - Mengembalikan `{ userHasClaimed: boolean, userEligibility: UserDropEligibilityResult }`.
     - Tambahkan response header: `Cache-Control: private, no-store`.
  3. Perbarui `lib/drops/client.ts` dan `app/drops/page.tsx`:
     - `fetchCurrentDrop()` memanggil endpoint publik yang ter-cache.
     - Jika pengguna terautentikasi (`status === "authenticated"`), panggil `fetchUserDropStatus()`.
     - Gabungkan state di frontend tanpa mengubah elemen visual UI sedikit pun.
- **Dependency**: P0.3 selesai.
- **Risiko & Potensi Regresi**: Sedang. Memerlukan sinkronisasi state di frontend saat pengguna baru saja melakukan login, logout, atau menyelesaikan klaim.
- **Test Wajib**:
  - `npm run test tests/drops/current-route.test.ts`
  - `npm run test tests/drops/drops-page.test.tsx`
- **Kriteria Keberhasilan**:
  - Kunjungan berulang oleh pengguna anonim ke `/api/drops/current` dalam jendela 5 detik dilayani dengan status `HIT` / `STALE` dari Vercel Edge Cache tanpa menyentuh serverless database.
  - Data privat pengguna tidak pernah tercampur atau bocor antar user.
  - Proses klaim tetap mengevaluasi kelayakan real-time di PostgreSQL.
- **Cara Rollback**: Kembalikan endpoint ke `force-dynamic` monolitik dan satukan kembali fetch frontend.

---

### Phase P1.2 — Batch Eligibility Query
- **Tujuan**: Menghilangkan pola query N+1 pada pengecekan progres tugas kampanye di fungsi evaluasi kelayakan.
- **File Terdampak**:
  - `server/drops/eligibility.ts`
- **Kondisi Saat Ini**:
  - Baris 158–180: Loop mengeksekusi `prisma.taskProgress.findUnique` satu per satu untuk setiap tugas wajib.
- **Perubahan yang Diperlukan**:
  1. Kumpulkan seluruh `taskId` dan `versionId` dari tugas wajib aktif ke dalam array.
  2. Jalankan kueri tunggal:
     ```ts
     const progressList = await prismaOrTx.taskProgress.findMany({
       where: {
         userId,
         versionId: { in: activeVersionIds },
         taskId: { in: mandatoryTaskIds },
       },
       include: {
         evidenceSubmissions: { where: { status: "APPROVED" } },
       },
     });
     ```
  3. Petakan hasil ke dalam `Map<string, TaskProgress>` dengan kunci `${versionId}:${taskId}`.
  4. Lakukan evaluasi status tugas dari Map in-memory dalam kompleksitas $O(1)$ tanpa kueri database tambahan.
- **Dependency**: P1.1 selesai.
- **Risiko & Potensi Regresi**: Rendah. Logika bisnis kelayakan (syarat dompet, X account, banned check, slot WL check) tidak diubah.
- **Test Wajib**:
  - `npm run test tests/drops/eligibility.test.ts`
  - `npm run test tests/drops/claim.test.ts`
- **Kriteria Keberhasilan**:
  - Jumlah kueri database pada fungsi `checkUserDropEligibility` berkurang dari $1 + N$ menjadi 1 kueri batch untuk tugas kampanye.
  - Hasil evaluasi kelayakan identik 100% dengan versi sebelumnya.
- **Cara Rollback**: Kembalikan `server/drops/eligibility.ts` ke versi sebelumnya via git.

---

### Phase P1.3 — Countdown Rollover Jitter
- **Tujuan**: Mencegah request serentak ke server saat countdown timer klien mencapai angka nol.
- **File Terdampak**:
  - `app/drops/page.tsx`
- **Kondisi Saat Ini**:
  - Baris 395 dan 401: Timer refresh menggunakan waktu statis `1000` ms (`setTimeout(..., 1000)`).
- **Perubahan yang Diperlukan**:
  1. Tambahkan kalkulasi jitter acak antara 500 ms hingga 2500 ms:
     ```ts
     const jitterMs = 500 + Math.floor(Math.random() * 2000);
     const timer = setTimeout(() => {
       void loadDropData();
     }, jitterMs);
     ```
  2. Terapkan pada kedua kondisi rollover (pergantian jendela klaim dan pergantian siklus periode).
- **Dependency**: P1.2 selesai.
- **Risiko & Potensi Regresi**: Sangat rendah.
- **Test Wajib**:
  - `npm run test tests/drops/drops-page.test.tsx`
- **Kriteria Keberhasilan**:
  - Refresh otomatis klien terdistribusi merata dalam rentang waktu 2 detik setelah timer 00:00:00.
- **Cara Rollback**: Kembalikan waktu timeout ke nilai statis `1000`.

---

### Phase P2 — Deferred Optimization (Post-Metrics Review)
- **Tujuan**: Mengintegrasikan React Query untuk caching state frontend dan Redis List untuk recent unboxings jika metrik staging membuktikan kebutuhannya.
- **Status**: **DITUNDA (DEFERRED)**.
- **Evaluasi**: Akan dievaluasi ulang setelah pengujian beban P0 dan P1 selesai dijalankan di Staging.

---

## 5. Implementation Progress Tracker

Tabel pelacakan status resmi yang diperbarui pada setiap fase implementasi:

| Tahap | Prioritas | Status | Modul Utama | Cakupan Pengujian | Review & Approval |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0.1** | P0 | `COMPLETED` | `app/api/drops/current/route.ts` | Unit test route & schedule | Selesai & Terverifikasi |
| **P0.2** | P0 | `READY` | `lib/prisma.ts` | Prisma singleton, claim concurrency | Menunggu review & persetujuan user |
| **P0.3** | P0 | `PLANNED` | `server/drops/auto-replenish.ts`, `lib/redis/lock.ts` | Auto-replenish & race condition test | Menunggu P0.2 |
| **P1.1** | P1 | `PLANNED` | `app/api/drops/*`, `app/drops/page.tsx` | Edge cache headers, user status isolation | Menunggu P0.3 |
| **P1.2** | P1 | `PLANNED` | `server/drops/eligibility.ts` | Eligibility unit & regression test | Menunggu P1.1 |
| **P1.3** | P1 | `PLANNED` | `app/drops/page.tsx` | UI rollover & countdown tests | Menunggu P1.2 |
| **P2** | P2 | `DEFERRED` | Frontend React Query & Redis Unboxings | Evaluasi pasca pengujian beban | Ditunda |

---

## 6. Staging Performance Test Plan

Pengujian beban hanya dilakukan pada lingkungan **Staging terisolasi** menggunakan skrip yang telah disiapkan di folder `tests/load/`.

### 6.1 Matriks Skenario Uji Staging

| ID Skenario | Profil Beban | Target Konkurensi | Durasi | Alat Pengujian | Kriteria Lolos (Pass) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **ST-01** | Drops Page Load Baseline | 50 concurrent VU | 60s | `autocannon` / `k6` | P95 Latensi $\le 300\text{ ms}$, Error rate $0\%$ |
| **ST-02** | Drops Page Load Medium | 100 concurrent VU | 60s | `k6` | P95 Latensi $\le 500\text{ ms}$, Error rate $\le 0.1\%$ |
| **ST-03** | Drops Page Load Peak | 250 concurrent VU | 120s | `k6` | P95 Latensi $\le 800\text{ ms}$, Database connection stabil |
| **ST-04** | Countdown Rollover Spike | 250 VU spike pada timer 0 | 20s | `k6` spike profile | Redis lock aktif, zero duplicate period, zero crash |
| **ST-05** | Concurrent Claims Normal | 100 concurrent claims | 30s | `k6-drops-claim.js` | P95 Latensi $\le 1.200\text{ ms}$, Invariants $100\%$ valid |
| **ST-06** | Stock Exhaustion Race | 500 VU vs 50 item stok | Sampai habis | `autocannon-drops-claim.mjs` | Tepat 50 sukses, 450 error 409, sisa stok tepat 0 |
| **ST-07** | Duplicate Claim Attack | 50 request / 1 dompet | Seketika | `claim-concurrency.test.ts` | Tepat 1 klaim berhasil, 49 ditolak 409 |
| **ST-08** | Invariant Verification | Audit paska-uji database | N/A | `verify-stock-invariants.ts` | Invariants terpenuhi $100\%$ tanpa selisih |

### 6.2 Target Metrik Kinerja yang Dikumpulkan
- **Latensi Halaman Drops (`GET /api/drops/current`)**:
  - $P50 \le 150\text{ ms}$
  - $P95 \le 500\text{ ms}$
  - $P99 \le 1.000\text{ ms}$
- **Latensi Transaksi Klaim (`POST /api/drops/claim`)**:
  - $P95 \le 1.200\text{ ms}$
- **Tingkat Kesalahan (Error Rate)**: $\le 0.1\%$ (di luar status bisnis normal 409 Stock Exhausted atau 429 Rate Limited).
- **Penggunaan Koneksi Database**: Tidak melebihi kuota pool Supabase.
- **Integritas Stok & Edisi**:
  - `remainingStock >= 0` ($100\%$ terpenuhi).
  - `claimedStock + remainingStock === allocatedStock` ($100\%$ konsisten).
  - Setiap nomor edisi trait bersifat unik (`@@unique([traitId, edition])`).

---

*Dokumen ini merupakan panduan implementasi resmi. Dilarang melakukan modifikasi kode di luar tahapan yang telah disetujui.*

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## User Preferences & Rules

- **JANGAN PERNAH ADA ICON (KECUALI TOMBOL SIGN IN & REFRESH)**: Jangan pernah menambahkan icon (baik icon Lucide, icon dot/bullet, SVG icon, atau emoji) pada komponen UI **kecuali** untuk **tombol Sign In** (`LogIn`) dan **tombol Refresh** (`RefreshCw` — boleh menggunakan icon atau diganti icon saja). Selain dua tombol tersebut, desain harus bersih, minimalis, dan mewah tanpa icon dekoratif.
- **BRAND & CHAIN IDENTITAS RESMI**: **Elychimp** adalah nama resmi Brand / Produk (bukan ChimpHood), sedangkan **Elysium** adalah nama Chain / Jaringan tempat Elychimp berjalan. Selalu gunakan **Elychimp** untuk merujuk ke produk/platform/koleksi dan **Elysium** untuk merujuk ke jaringan/chain.
- **Top Profile Card & Panel Header**: Harus bersih tanpa teks atau badge berlebihan seperti `//`, `FULL CHARACTER SET`, `ELYCHIMP`, `SYNCED`, `5/5 ACTIVE`, atau tombol navigasi tambahan. Jangan pernah menambahkan badge status/counter dekoratif di pojok kanan atas header panel. Tetap fokus pada judul bersih, status whitelist, pills ringkas tanpa icon, dan avatar dalam bingkai kaca mewah.
- **TERMINOLOGI WHITELIST (SINGLE GOAL — TANPA GTD/FCFS & TANPA LABEL "MANDATORY" DI UI PUBLIK)**: Tujuan utama user di halaman Whitelist (`/whitelist`), Profile (`/profile`), maupun Docs (`/docs`) adalah satu: mendapatkan status **Whitelist (WL)** / **Whitelisted** dengan menyelesaikan seluruh 5 langkah (Wallet, X Sync, Campaign Tasks, dan 5/5 Trait Categories). Jangan pernah menonjolkan istilah teknis `GTD`, `FCFS`, `FCFS Registered`, `FCFS Visitor`, atau `Queue` pada UI publik maupun kartu Lanyard ID, serta jangan menampilkan kata `Mandatory` pada UI daftar/status task. Pembagian kuota (1.000 slot utama GTD dan sisanya FCFS) hanya berjalan di belakang layar (backend database & Admin OpenSea Export). Jangan menampilkan kartu Lanyard Pass kepada user yang belum menyelesaikan 5/5 syarat kualifikasi.
- **FLOW VERIFIKASI BUKTI (OPTIMISTIC AUTO-APPROVAL & POST-AUDIT MODERATION)**:
  - **Sisi User (`/whitelist`)**: Menggunakan mekanisme *Optimistic Auto-Approval*. User yang mengunggah bukti tugas (Follow, Like, Repost, Reply, Quote) langsung otomatis disetujui secara instan (status hijau / verified) tanpa status "Pending Review", sehingga tidak ada friksi menunggu bagi user publik.
  - **Sisi Admin (`/admin?tab=evidence` & `/admin?tab=whitelist`)**: Berfungsi sebagai antrean moderasi pasca-audit (*Post-Audit Moderation Queue*).
    - **Filter Antrean**: Default filter adalah `Needs Audit (X)` yang mengelompokkan submission auto-approved yang belum pernah diperiksa oleh admin manusia. Tersedia juga tab `Audited & Verified (Y)`, `Rejected (Z)`, dan `All Submissions (N)` lengkap dengan counter *real-time*.
    - **Status Audit di Kartu**: Submission ditandai dengan badge jelas: `Needs Audit` (amber) + `Auto-Approved` (cyan) vs `Audited & Verified` (emerald) vs `Rejected` (rose).
    - **Tombol Konfirmasi Sah**: Tombol `Confirm Valid` aktif untuk submission *Needs Audit*. Begitu diklik, sistem merekam `reviewerId` admin dan mengubah status visual menjadi *Audited & Verified* (`Confirmed Valid` - disabled).
    - **Tombol Reject & Sinkronisasi WL**: Admin dapat menolak (`Reject`) bukti yang palsu/salah kapan saja. Penolakan bukti di tab Evidence otomatis mengubah slot Whitelist user menjadi `reviewStatus: "FLAGGED"`, memicu evaluasi kelayakan seketika, dan memunculkan notifikasi merah di portal `/whitelist` user agar user dapat memperbaiki bukti tugasnya.
    - **Tautan Bukti Aktif**: Seluruh payload URL bukti tugas dapat langsung diklik (`target="_blank" rel="noreferrer noopener"`), baik di panel Evidence Review maupun di modal Whitelist Review Details.




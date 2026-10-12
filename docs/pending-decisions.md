# Pending Decisions Registry

Dokumen ini mencatat seluruh keputusan arsitektur, teknis, dan produk yang belum difinalisasi. Sesuai prinsip instruksi master: **tidak mengarang keputusan produk**. Keputusan di bawah ini harus dikonfirmasi sebelum melanjutkan ke tahap implementasi terkait.

---

## 1. Autentikasi & Manajemen Sesi

| ID          | Topik                               | Status             | Pertanyaan / Pilihan                                                                                                                         | Dampak                                                                                    |
| ----------- | ----------------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **DEC-001** | **Arsitektur Session Provider**     | `PENDING DECISION` | Apakah menggunakan **Auth.js (NextAuth v5)**, **Iron Session (stateless encrypted cookie)**, atau **Custom JWT stateless**?                  | Menentukan format token, penyimpanan sesi di database vs cookie, dan integrasi API route. |
| **DEC-002** | **Web3 Wallet Connector Suite**     | `PENDING DECISION` | Pilihan toolkit wallet: **Wagmi v2 + AppKit (Reown)**, **RainbowKit**, atau **Privy / Dynamic**?                                             | Menentukan library dependensi client-side dan skema UI wallet modal.                      |
| **DEC-003** | **Alur Sesi X (Twitter) OAuth 2.0** | `PENDING DECISION` | Apakah akun X diikat ke wallet pengguna melalui alur primary auth atau secondary linked account? Bagaimana mekanisme refresh token disimpan? | Menentukan skema relasi tabel `User` dan `SocialAccount`.                                 |

---

## 2. Model Data & Database (Prisma)

| ID          | Topik                                         | Status             | Pertanyaan / Pilihan                                                                                                                 | Dampak                                                                                        |
| ----------- | --------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **DEC-004** | **Spesifikasi Data Model Final**              | `PENDING DECISION` | Struktur tabel final untuk `User`, `WhitelistAllocation`, `Campaign`, `Claim`, dan `GiftDistribution` belum disahkan.                | **Blokade migrasi database**: Tidak boleh membuat atau menjalankan migrasi sebelum disetujui. |
| **DEC-005** | **Identitas Utama Akun (Primary Identifier)** | `PENDING DECISION` | Apakah primary identifier pengguna adalah `wallet_address` (string), atau `cuid/uuid` independen yang dapat menautkan banyak wallet? | Struktur relasi one-to-many atau one-to-one pada database.                                    |
| **DEC-006** | **Manajemen Multi-Chain**                     | `PENDING DECISION` | Apakah alokasi whitelist terbatas pada satu chain (misal Ethereum / Arbitrum) atau multi-chain?                                      | Menentukan kolom `chain_id` pada tabel transaksi dan alokasi.                                 |

---

## 3. Claim Engine & Whitelist Allocation

| ID          | Topik                                   | Status             | Pertanyaan / Pilihan                                                                                                                             | Dampak                                                                     |
| ----------- | --------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| **DEC-007** | **Metode Verifikasi Alokasi Whitelist** | `PENDING DECISION` | Apakah alokasi diverifikasi murni melalui **Database PostgreSQL (Off-chain claim)** atau melalui **Merkle Proof On-Chain Smart Contract**?       | Menentukan kebutuhan smart contract deployer dan arsitektur backend claim. |
| **DEC-008** | **Mekanisme Eksekusi Klaim (Gas Fee)**  | `PENDING DECISION` | Apakah klaim dilakukan oleh pengguna sendiri (user membayar gas) atau gasless melalui Relayer (misal Biconomy / Gelato / OpenZeppelin Defender)? | Menentukan integrasi relayer dan biaya operasional protokol.               |
| **DEC-009** | **Gift Engine & Mekanisme Referral**    | `PENDING DECISION` | Bagaimana aturan pembagian alokasi hadiah? Apakah transferable, dan apa mekanisme proteksi anti-sybil?                                           | Logika validasi bisnis dan batas kuota.                                    |

---

## 4. Admin Portal & Tata Kelola

| ID          | Topik                     | Status             | Pertanyaan / Pilihan                                                                                                                   | Dampak                                         |
| ----------- | ------------------------- | ------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **DEC-010** | **Otorisasi Role Admin**  | `PENDING DECISION` | Apakah admin diverifikasi melalui whitelist alamat wallet (admin wallet list), secret API key, atau role di database?                  | Keamanan endpoint mutasi kampanye dan alokasi. |
| **DEC-011** | **Audit Trail & Logging** | `PENDING DECISION` | Format logging untuk aktivitas administratif dan distribusi alokasi (misal event stream, tabel database audit, atau external service). | Kepatuhan keamanan data dan monitoring.        |

---

## Prosedur Pembaruan

Setiap keputusan yang telah ditentukan harus diperbarui statusnya menjadi `RESOLVED` beserta tanggal, tautan keputusan, dan implikasi implementasinya.

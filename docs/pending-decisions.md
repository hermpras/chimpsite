# Pending Decisions Registry

This document records all architectural, technical, and product decisions. In accordance with the core principle: **do not invent product decisions**. The decisions below are updated based on the progress of Stage 1 (Data Model & Database Foundation).

---

## 1. Authentication & Session Management (Stage 2)

| ID          | Topic                                  | Status             | Question / Options                                                                                                    | Impact                                                                                  |
| ----------- | -------------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| **DEC-001** | **Session Provider Architecture**      | `PENDING DECISION` | Whether to use **Auth.js (NextAuth v5)**, **Iron Session (stateless encrypted cookie)**, or **Custom JWT stateless**? | Determines token format, database session storage vs cookie, and API route integration. |
| **DEC-002** | **Web3 Wallet Connector Suite**        | `PENDING DECISION` | Choice of wallet toolkit: **Wagmi v2 + AppKit (Reown)**, **RainbowKit**, or **Privy / Dynamic**?                      | Determines client-side dependency libraries and wallet modal UI patterns.               |
| **DEC-003** | **X (Twitter) OAuth 2.0 Session Flow** | `PENDING DECISION` | How to implement token refresh and OAuth 2.0 PKCE when linking an X account to a primary wallet?                      | Account linking logic in Stage 2/3.                                                     |

---

## 2. Data Model & Database (Stage 1 - Resolution Status)

| ID          | Topic                                        | Status                    | Decision Outcome & Reference                                                                                                                                                                                                         |
| ----------- | -------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DEC-004** | **Final Data Model Specification**           | `RESOLVED (Oct 13, 2026)` | PostgreSQL data model schema via Prisma completed with 26 entity models, relationships, unique constraints, and comprehensive indexing in `prisma/schema.prisma` alongside SQL migration review in `prisma/migrations/`.             |
| **DEC-005** | **Primary Account Identifier**               | `RESOLVED (Oct 13, 2026)` | `User` is the root record with an independent ID (`cuid`), possessing a 1:1 relation to `WalletIdentity` (primary identity) and a 1:1 relation to `XIdentity` (linked social account).                                               |
| **DEC-006** | **Multi-Chain Management**                   | `RESOLVED (Oct 13, 2026)` | No blockchain minting, smart contracts, or on-chain transfers. All allocations are recorded in PostgreSQL. The `chainId` column is retained as an EVM network reference (default 1 / Ethereum).                                      |
| **DEC-007** | **Whitelist Allocation Verification Method** | `RESOLVED (Oct 13, 2026)` | Allocations are verified and tracked purely off-chain through PostgreSQL using separate lifecycle stages: `WLQualification` (qualification), `WLQueueEntry` (queue), `WLSlot` (slot allocation), and `WLStatusHistory`.              |
| **DEC-008** | **Claim Execution Mechanism (Gas Fees)**     | `RESOLVED (Oct 13, 2026)` | No on-chain transactions; drop claims are conducted entirely off-chain without user gas fees or third-party relayers.                                                                                                                |
| **DEC-009** | **Gift Engine & Trait Ownership**            | `RESOLVED (Oct 13, 2026)` | Each trait copy is a distinct `InventoryItem` entity with a unique edition. Gifting transfers an existing item rather than minting new copies. Pending gifts expire after 24 hours. Anti-sybil protections enforced via `AbuseFlag`. |
| **DEC-010** | **Admin Role Authorization**                 | `RESOLVED (Oct 13, 2026)` | Admin authorization is defined through the `UserRole` enum (`USER`, `MODERATOR`, `ADMIN`, `SUPER_ADMIN`) and the `AdminRole` model with granular permission lists (`permissions: String[]`).                                         |
| **DEC-011** | **Audit Trail & Logging**                    | `RESOLVED (Oct 13, 2026)` | Sensitive mutations, review actions, slot allocations, and bans are recorded in the PostgreSQL `AuditLog` table capturing the actor (`actorId`), action type, entity payload, and audit metadata.                                    |

---

## 3. Advanced Policies & Business Rules (Pending Review)

| ID          | Topic                                                          | Status             | Question / Options                                                                                                                                                                                         | Impact                                                                         |
| ----------- | -------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **DEC-012** | **Ban Policy Matrix & Abuse Flag Thresholds**                  | `PENDING DECISION` | What are the specific numeric thresholds for automated bot/sybil flagging (e.g., repeated claim attempts within 1 minute, IP clustering) and the absolute authority hierarchy for revoking permanent bans? | Anti-sybil engine parameters and admin moderation workflows in future stages.  |
| **DEC-013** | **Whitelist Queue Priority Score & Reconciliation Parameters** | `PENDING DECISION` | What is the exact formula for computing `priorityScore` in the Whitelist queue (e.g., pure campaign points vs combined trait ownership weighting)?                                                         | Slot allocation priority determination for the Whitelist queue service worker. |

---

## Update Procedure

Every resolved decision must have its status updated to `RESOLVED` along with its date, decision reference, and implementation implications.

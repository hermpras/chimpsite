// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import { Wallet, type HDNodeWallet } from "ethers";
import { SiweMessage } from "siwe";
import { createHash } from "node:crypto";
import type { PrismaClient, AdminRoleType } from "@prisma/client";

// Core Services
import { issueNonce } from "@/server/auth/nonce";
import { verifySiweLogin } from "@/server/auth/verify";
import { requireAdminSession } from "@/server/auth/session";
import { claimDrop } from "@/server/drops/claim";
import { emergencyCloseDropPeriod } from "@/server/drops/emergency-close";
import { sendGift, acceptGift } from "@/server/inventory/gift";
import {
  evaluateUserQualification,
  reconcileQueueSlots,
  REQUIRED_TRAIT_CATEGORIES,
} from "@/server/whitelist/qualification";
import { revokeWlSlot } from "@/server/whitelist/revoke";
import { createCampaign, updateCampaign } from "@/server/admin/campaign";
import { createCampaignTask } from "@/server/admin/campaign-task";
import { submitTaskEvidence } from "@/server/tasks/evidence";
import { reviewEvidence, listAdminEvidence } from "@/server/admin/evidence";
import { banUser, revokeBan } from "@/server/admin/ban";

const DOMAIN = "localhost:3000";
const URI = "http://localhost:3000";
const VERIFY_OPTS = { expectedDomain: DOMAIN, expectedUri: URI, allowedChainIds: [1] };
const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");

// ---------------------------------------------------------------------------
// Unified In-Memory Prisma Store for End-to-End Testing
// ---------------------------------------------------------------------------

function createIntegrationDatabase() {
  const store = {
    users: [] as any[],
    wallets: [] as any[],
    xIdentities: [] as any[],
    nonces: [] as any[],
    sessions: [] as any[],
    adminRoles: [] as any[],
    banRecords: [] as any[],
    traits: [] as any[],
    inventoryItems: [] as any[],
    drops: [] as any[],
    dropPeriods: [] as any[],
    dropPoolItems: [] as any[],
    claims: [] as any[],
    gifts: [] as any[],
    campaigns: [] as any[],
    campaignVersions: [] as any[],
    campaignTasks: [] as any[],
    taskProgresses: [] as any[],
    evidenceSubmissions: [] as any[],
    programs: [] as any[],
    qualifications: [] as any[],
    queueEntries: [] as any[],
    slots: [] as any[],
    statusHistories: [] as any[],
    auditLogs: [] as any[],
  };

  const createTx = () => {
    return {
      user: {
        findUnique: vi.fn(async ({ where, select }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (!user) return null;
          const wallet = store.wallets.find((w) => w.userId === user.id);
          const xIdentity = store.xIdentities.find((x) => x.userId === user.id);
          const adminRole = store.adminRoles.find((a) => a.userId === user.id);

          // Support nested banRecords where-filter (used by evidence.ts ban check)
          const banRecordsWhere = select?.banRecords?.where;
          let banRecords = store.banRecords.filter((b) => b.userId === user.id);
          if (banRecordsWhere) {
            if (banRecordsWhere.isActive !== undefined) {
              banRecords = banRecords.filter(
                (b) => b.isActive === banRecordsWhere.isActive,
              );
            }
            if (banRecordsWhere.scope?.in) {
              banRecords = banRecords.filter((b) =>
                banRecordsWhere.scope.in.includes(b.scope),
              );
            }
          }

          return {
            ...user,
            wallet,
            xIdentity,
            banRecords,
            adminRole,
          };
        }),
        create: vi.fn(async ({ data }: any) => {
          const newUser = {
            id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            isBanned: false,
            createdAt: new Date(),
            ...data,
          };
          store.users.push(newUser);
          return newUser;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const user = store.users.find((u) => u.id === where.id);
          if (user) Object.assign(user, data);
          return user;
        }),
      },
      walletIdentity: {
        findUnique: vi.fn(async ({ where }: any) => {
          const w = store.wallets.find((item) => {
            if (where.address)
              return item.address.toLowerCase() === where.address.toLowerCase();
            if (where.userId) return item.userId === where.userId;
            return false;
          });
          if (!w) return null;
          const user = store.users.find((u) => u.id === w.userId);
          return { ...w, user };
        }),
        create: vi.fn(async ({ data }: any) => {
          let user = null;
          let userId = data.userId;
          if (data.user?.create) {
            user = {
              id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              isBanned: false,
              createdAt: new Date(),
              ...data.user.create,
            };
            store.users.push(user);
            userId = user.id;
          } else if (userId) {
            user = store.users.find((u) => u.id === userId) || null;
          }
          const wallet = {
            id: `wal_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            userId,
            user,
            address: data.address.toLowerCase(),
            createdAt: new Date(),
          };
          store.wallets.push(wallet);
          return wallet;
        }),
      },
      siweNonce: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.nonces.find((n) => n.nonce === where.nonce) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const nonce = { ...data, consumedAt: null };
          store.nonces.push(nonce);
          return nonce;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const n of store.nonces) {
            if (
              n.nonce === where.nonce &&
              n.consumedAt === null &&
              n.expiresAt > (where.expiresAt?.gt ?? new Date(0))
            ) {
              if (where.OR) {
                const match = where.OR.some(
                  (cond: any) => cond.address === null || cond.address === n.address,
                );
                if (!match) continue;
              }
              Object.assign(n, data);
              count++;
            }
          }
          return { count };
        }),
      },
      authSession: {
        create: vi.fn(async ({ data }: any) => {
          const session = {
            id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.sessions.push(session);
          return session;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const s of store.sessions) {
            if (
              (!where.userId || s.userId === where.userId) &&
              (!where.revokedAt || s.revokedAt === where.revokedAt)
            ) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        }),
      },
      adminRole: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.adminRoles.find((a) => a.userId === where.userId) ?? null;
        }),
      },
      banRecord: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.banRecords.find((b) => {
              if (b.userId !== where.userId) return false;
              if (where.isActive !== undefined && b.isActive !== where.isActive)
                return false;
              if (where.scope?.in && !where.scope.in.includes(b.scope)) return false;
              return true;
            }) ?? null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          return store.banRecords.find((b) => b.id === where.id) ?? null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const ban = {
            id: `ban_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.banRecords.push(ban);
          return ban;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const ban = store.banRecords.find((b) => b.id === where.id);
          if (ban) Object.assign(ban, data);
          return ban;
        }),
      },
      trait: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.traits.find((t) => t.id === where.id) ?? null;
        }),
        findMany: vi.fn(async () => store.traits),
      },
      inventoryItem: {
        findUnique: vi.fn(async ({ where }: any) => {
          const item = store.inventoryItems.find((i) => i.id === where.id);
          if (!item) return null;
          const trait = store.traits.find((t) => t.id === item.traitId);
          return { ...item, trait };
        }),
        findFirst: vi.fn(async ({ where, orderBy }: any) => {
          const items = store.inventoryItems.filter((i) => {
            if (where.traitId && i.traitId !== where.traitId) return false;
            if (where.ownerId && i.ownerId !== where.ownerId) return false;
            return true;
          });
          if (orderBy?.edition === "desc") {
            items.sort((a, b) => b.edition - a.edition);
          }
          return items[0] ?? null;
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.inventoryItems
            .filter((i) => {
              if (where.ownerId && i.ownerId !== where.ownerId) return false;
              if (where.traitId && i.traitId !== where.traitId) return false;
              return true;
            })
            .map((i) => ({
              ...i,
              trait: store.traits.find((t) => t.id === i.traitId),
            }));
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.inventoryItems.filter((i) => {
            if (where.ownerId && i.ownerId !== where.ownerId) return false;
            if (where.traitId && i.traitId !== where.traitId) return false;
            return true;
          }).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const item = {
            id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.inventoryItems.push(item);
          return item;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const item = store.inventoryItems.find((i) => i.id === where.id);
          if (item) Object.assign(item, data);
          return item;
        }),
      },
      drop: {
        findUnique: vi.fn(async ({ where }: any) => {
          return store.drops.find((d) => d.id === where.id) ?? null;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const d = store.drops.find((drop) => drop.id === where.id);
          if (d) Object.assign(d, data);
          return d;
        }),
      },
      dropPeriod: {
        findUnique: vi.fn(async ({ where }: any) => {
          const p = store.dropPeriods.find((dp) => dp.id === where.id);
          if (!p) return null;
          const drop = store.drops.find((d) => d.id === p.dropId);
          const poolItems = store.dropPoolItems
            .filter((dpi) => dpi.periodId === p.id)
            .map((dpi) => ({
              ...dpi,
              trait: store.traits.find((t) => t.id === dpi.traitId),
            }));
          return { ...p, drop, poolItems };
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const p = store.dropPeriods.find((dp) => dp.id === where.id);
          if (p) Object.assign(p, data);
          return p;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const p of store.dropPeriods) {
            if (p.id === where.id && (!where.status || p.status === where.status)) {
              Object.assign(p, data);
              count++;
            }
          }
          return { count };
        }),
      },
      dropPoolItem: {
        findMany: vi.fn(async ({ where }: any) => {
          return store.dropPoolItems
            .filter((dpi) => {
              if (where.periodId && dpi.periodId !== where.periodId) return false;
              if (
                where.remainingStock?.gt !== undefined &&
                dpi.remainingStock <= where.remainingStock.gt
              )
                return false;
              return true;
            })
            .map((dpi) => ({
              ...dpi,
              trait: store.traits.find((t) => t.id === dpi.traitId),
            }));
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const dpi = store.dropPoolItems.find((item) => item.id === where.id);
          if (dpi && data.remainingStock?.decrement) {
            dpi.remainingStock -= data.remainingStock.decrement;
            dpi.claimedStock = (dpi.claimedStock || 0) + data.remainingStock.decrement;
          }
          return dpi;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const item of store.dropPoolItems) {
            if (
              item.id === where.id &&
              (where.remainingStock?.gt === undefined ||
                item.remainingStock > where.remainingStock.gt)
            ) {
              if (data.remainingStock?.decrement) {
                item.remainingStock -= data.remainingStock.decrement;
              }
              if (data.claimedStock?.increment) {
                item.claimedStock =
                  (item.claimedStock || 0) + data.claimedStock.increment;
              }
              count++;
            }
          }
          return { count };
        }),
      },
      claim: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.userId_dropId_periodId) {
            const { userId, dropId, periodId } = where.userId_dropId_periodId;
            return (
              store.claims.find(
                (c) =>
                  c.userId === userId && c.dropId === dropId && c.periodId === periodId,
              ) ?? null
            );
          }
          return null;
        }),
        create: vi.fn(async ({ data }: any) => {
          const claim = {
            id: `claim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            claimedAt: new Date(),
          };
          store.claims.push(claim);
          return claim;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const c of store.claims) {
            if (
              (!where.periodId || c.periodId === where.periodId) &&
              (!where.status || c.status === where.status)
            ) {
              Object.assign(c, data);
              count++;
            }
          }
          return { count };
        }),
      },
      gift: {
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.gifts.find((g) => {
              if (where.senderId && g.senderId !== where.senderId) return false;
              if (where.receiverId && g.receiverId !== where.receiverId) return false;
              if (where.status && g.status !== where.status) return false;
              return true;
            }) ?? null
          );
        }),
        findUnique: vi.fn(async ({ where }: any) => {
          const g = store.gifts.find((gift) => gift.id === where.id);
          if (!g) return null;
          const inventoryItem = store.inventoryItems.find(
            (i) => i.id === g.inventoryItemId,
          );
          return {
            ...g,
            inventoryItem: inventoryItem
              ? {
                  ...inventoryItem,
                  trait: store.traits.find((t) => t.id === inventoryItem.traitId),
                }
              : null,
          };
        }),
        create: vi.fn(async ({ data }: any) => {
          const gift = {
            id: `gift_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.gifts.push(gift);
          return gift;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const g = store.gifts.find((gift) => gift.id === where.id);
          if (g) Object.assign(g, data);
          return g;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const g of store.gifts) {
            if (g.id === where.id && (!where.status || g.status === where.status)) {
              Object.assign(g, data);
              count++;
            }
          }
          return { count };
        }),
      },
      promoCampaign: {
        findUnique: vi.fn(async ({ where }: any) => {
          const c = store.campaigns.find(
            (item) => item.id === where.id || item.slug === where.slug,
          );
          if (!c) return null;
          const versions = store.campaignVersions.filter((v) => v.campaignId === c.id);
          return { ...c, versions };
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.campaigns
            .filter((c) => {
              if (where.wlProgramId && c.wlProgramId !== where.wlProgramId) return false;
              if (where.status && c.status !== where.status) return false;
              return true;
            })
            .map((c) => ({
              ...c,
              versions: store.campaignVersions
                .filter((v) => v.campaignId === c.id && v.isCurrent)
                .map((v) => ({
                  ...v,
                  tasks: store.campaignTasks.filter(
                    (t) => t.versionId === v.id && t.isRequired,
                  ),
                })),
            }));
        }),
        create: vi.fn(async ({ data }: any) => {
          const campId = `camp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
          const versions = [];
          if (data.versions?.create) {
            const ver = {
              id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              campaignId: campId,
              versionNumber: 1,
              isCurrent: true,
              ...data.versions.create,
              createdAt: new Date(),
            };
            store.campaignVersions.push(ver);
            versions.push(ver);
          }
          const camp = {
            id: campId,
            ...data,
            versions,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.campaigns.push(camp);
          return camp;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const camp = store.campaigns.find((c) => c.id === where.id);
          if (camp) {
            Object.assign(camp, data, { updatedAt: new Date() });
            camp.versions = store.campaignVersions.filter(
              (v) => v.campaignId === camp.id,
            );
          }
          return camp;
        }),
      },
      campaignVersion: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.campaignId_versionNumber) {
            const { campaignId, versionNumber } = where.campaignId_versionNumber;
            return (
              store.campaignVersions.find(
                (v) => v.campaignId === campaignId && v.versionNumber === versionNumber,
              ) ?? null
            );
          }
          return store.campaignVersions.find((v) => v.id === where.id) ?? null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.campaignVersions.find((v) => {
              if (where.campaignId && v.campaignId !== where.campaignId) return false;
              if (where.isCurrent !== undefined && v.isCurrent !== where.isCurrent)
                return false;
              return true;
            }) ?? null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const ver = {
            id: `ver_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
          };
          store.campaignVersions.push(ver);
          return ver;
        }),
      },
      campaignTask: {
        findUnique: vi.fn(async ({ where }: any) => {
          const t = store.campaignTasks.find((item) => item.id === where.id);
          if (!t) return null;
          const version = store.campaignVersions.find((v) => v.id === t.versionId);
          const campaign = version
            ? store.campaigns.find((c) => c.id === version.campaignId)
            : null;
          return {
            ...t,
            version: version ? { ...version, campaign } : null,
          };
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.campaignTasks.find((t) => {
              if (where.versionId && t.versionId !== where.versionId) return false;
              if (where.taskCode && t.taskCode !== where.taskCode) return false;
              return true;
            }) ?? null
          );
        }),
        create: vi.fn(async ({ data }: any) => {
          const task = {
            id: `tsk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.campaignTasks.push(task);
          return task;
        }),
      },
      taskProgress: {
        findUnique: vi.fn(async ({ where }: any) => {
          let progress = null;
          if (where.userId_versionId_taskId) {
            const { userId, versionId, taskId } = where.userId_versionId_taskId;
            progress = store.taskProgresses.find(
              (tp) =>
                tp.userId === userId &&
                tp.versionId === versionId &&
                tp.taskId === taskId,
            );
          } else if (where.id) {
            progress = store.taskProgresses.find((tp) => tp.id === where.id);
          }
          if (!progress) return null;
          const evidenceSubmissions = store.evidenceSubmissions.filter(
            (e) => e.taskProgressId === progress.id && e.status === "APPROVED",
          );
          return { ...progress, evidenceSubmissions };
        }),
        create: vi.fn(async ({ data }: any) => {
          const tp = {
            id: `tp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.taskProgresses.push(tp);
          return tp;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const tp = store.taskProgresses.find((p) => p.id === where.id);
          if (tp) Object.assign(tp, data, { updatedAt: new Date() });
          return tp;
        }),
      },
      evidenceSubmission: {
        findUnique: vi.fn(async ({ where }: any) => {
          const e = store.evidenceSubmissions.find((item) => item.id === where.id);
          if (!e) return null;
          const taskProgress = store.taskProgresses.find(
            (p) => p.id === e.taskProgressId,
          );
          const task = store.campaignTasks.find((t) => t.id === e.taskId);
          const user = store.users.find((u) => u.id === e.userId);
          const wallet = store.wallets.find((w) => w.userId === e.userId);
          const xIdentity = store.xIdentities.find((x) => x.userId === e.userId);
          return {
            ...e,
            taskProgress,
            task,
            user: user
              ? { ...user, wallet: wallet ?? null, xIdentity: xIdentity ?? null }
              : null,
          };
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.evidenceSubmissions.find((e) => {
              if (where.userId && e.userId !== where.userId) return false;
              if (where.taskId && e.taskId !== where.taskId) return false;
              if (where.status && e.status !== where.status) return false;
              return true;
            }) ?? null
          );
        }),
        findMany: vi.fn(async ({ where, skip = 0, take = 50 }: any) => {
          let list = [...store.evidenceSubmissions];
          if (where?.status) list = list.filter((e) => e.status === where.status);
          if (where?.taskId) list = list.filter((e) => e.taskId === where.taskId);
          if (where?.userId) list = list.filter((e) => e.userId === where.userId);
          return list.slice(skip, skip + take).map((sub) => {
            const user = store.users.find((u) => u.id === sub.userId);
            const wallet = store.wallets.find((w) => w.userId === sub.userId);
            const xIdentity = store.xIdentities.find((x) => x.userId === sub.userId);
            const task = store.campaignTasks.find((t) => t.id === sub.taskId);
            return {
              ...sub,
              user: user
                ? { ...user, wallet: wallet ?? null, xIdentity: xIdentity ?? null }
                : null,
              task,
            };
          });
        }),
        count: vi.fn(async ({ where }: any) => {
          let list = [...store.evidenceSubmissions];
          if (where?.status) list = list.filter((e) => e.status === where.status);
          if (where?.taskId) list = list.filter((e) => e.taskId === where.taskId);
          if (where?.userId) list = list.filter((e) => e.userId === where.userId);
          return list.length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const ev = {
            id: `ev_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          store.evidenceSubmissions.push(ev);
          return ev;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const ev = store.evidenceSubmissions.find((e) => e.id === where.id);
          if (ev) Object.assign(ev, data, { updatedAt: new Date() });
          return ev;
        }),
      },
      wLProgram: {
        findUnique: vi.fn(async ({ where }: any) => {
          return (
            store.programs.find((p) => p.id === where.id || p.slug === where.slug) ?? null
          );
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const p = store.programs.find((prog) => prog.id === where.id);
          if (p) {
            const { allocatedSlotsCount, ...rest } = data;
            if (allocatedSlotsCount?.increment) {
              p.allocatedSlotsCount =
                (p.allocatedSlotsCount ?? 0) + allocatedSlotsCount.increment;
            } else if (allocatedSlotsCount?.decrement) {
              p.allocatedSlotsCount = Math.max(
                0,
                (p.allocatedSlotsCount ?? 0) - allocatedSlotsCount.decrement,
              );
            } else if (typeof allocatedSlotsCount === "number") {
              p.allocatedSlotsCount = allocatedSlotsCount;
            }
            Object.assign(p, rest);
          }
          return p;
        }),
      },
      wLQualification: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.programId_userId;
          return (
            store.qualifications.find(
              (q) => q.programId === key.programId && q.userId === key.userId,
            ) ?? null
          );
        }),
        upsert: vi.fn(async ({ where, create, update }: any) => {
          const key = where.programId_userId;
          let q = store.qualifications.find(
            (item) => item.programId === key.programId && item.userId === key.userId,
          );
          if (q) {
            Object.assign(q, update);
          } else {
            q = {
              id: `qual_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              ...create,
            };
            store.qualifications.push(q);
          }
          return q;
        }),
      },
      wLQueueEntry: {
        findUnique: vi.fn(async ({ where }: any) => {
          const key = where.programId_userId;
          return (
            store.queueEntries.find(
              (q) => q.programId === key.programId && q.userId === key.userId,
            ) ?? null
          );
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.queueEntries.find(
              (q) =>
                (!where.programId || q.programId === where.programId) &&
                (!where.status || q.status === where.status),
            ) ?? null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.queueEntries.filter(
            (q) =>
              (!where.programId || q.programId === where.programId) &&
              (!where.status || q.status === where.status),
          );
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const q = store.queueEntries.find((item) => item.id === where.id);
          if (q) Object.assign(q, data);
          return q;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const q of store.queueEntries) {
            if (
              (!where.programId || q.programId === where.programId) &&
              (!where.userId || q.userId === where.userId) &&
              (!where.status || q.status === where.status)
            ) {
              Object.assign(q, data);
              count++;
            }
          }
          return { count };
        }),
        create: vi.fn(async ({ data }: any) => {
          const entry = {
            id: `qe_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            joinedAt: new Date(),
          };
          store.queueEntries.push(entry);
          return entry;
        }),
      },
      wLSlot: {
        findUnique: vi.fn(async ({ where }: any) => {
          if (where.programId_userId) {
            const { programId, userId } = where.programId_userId;
            return (
              store.slots.find((s) => s.programId === programId && s.userId === userId) ??
              null
            );
          }
          if (where.id) {
            return store.slots.find((s) => s.id === where.id) ?? null;
          }
          return null;
        }),
        findFirst: vi.fn(async ({ where }: any) => {
          return (
            store.slots.find((s) => {
              if (where.userId && s.userId !== where.userId) return false;
              if (where.programId && s.programId !== where.programId) return false;
              if (where.status?.in && !where.status.in.includes(s.status)) return false;
              return true;
            }) ?? null
          );
        }),
        findMany: vi.fn(async ({ where }: any) => {
          return store.slots.filter(
            (s) =>
              (!where.programId || s.programId === where.programId) &&
              (!where.status?.in || where.status.in.includes(s.status)),
          );
        }),
        count: vi.fn(async ({ where }: any) => {
          return store.slots.filter(
            (s) =>
              (!where.programId || s.programId === where.programId) &&
              (!where.status?.in || where.status.in.includes(s.status)),
          ).length;
        }),
        create: vi.fn(async ({ data }: any) => {
          const slot = {
            id: `slot_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            ...data,
            allocatedAt: new Date(),
          };
          store.slots.push(slot);
          return slot;
        }),
        update: vi.fn(async ({ where, data }: any) => {
          const slot = store.slots.find((s) => s.id === where.id);
          if (slot) Object.assign(slot, data);
          return slot;
        }),
        updateMany: vi.fn(async ({ where, data }: any) => {
          let count = 0;
          for (const s of store.slots) {
            if (
              s.id === where.id &&
              (!where.status?.in || where.status.in.includes(s.status))
            ) {
              Object.assign(s, data);
              count++;
            }
          }
          return { count };
        }),
      },
      wLStatusHistory: {
        create: vi.fn(async ({ data }: any) => {
          const hist = { id: `hist_${Date.now()}`, ...data, createdAt: new Date() };
          store.statusHistories.push(hist);
          return hist;
        }),
      },
      auditLog: {
        create: vi.fn(async ({ data }: any) => {
          const log = { id: `audit_${Date.now()}`, ...data, createdAt: new Date() };
          store.auditLogs.push(log);
          return log;
        }),
      },
    };
  };

  const client: any = {
    ...createTx(),
    $transaction: vi.fn(async (cb: any) => {
      const tx = createTx();
      return await cb(tx);
    }),
  };

  return { store, client };
}

// ---------------------------------------------------------------------------
// Helper: Sign SIWE Login
// ---------------------------------------------------------------------------

async function performSiweLogin(prisma: PrismaClient, wallet: Wallet | HDNodeWallet) {
  const address = wallet.address.toLowerCase();
  const now = new Date();
  // 1. Issue address-bound nonce
  const { nonce } = await issueNonce(prisma, { address });

  // 2. Construct SIWE message with current timestamp
  const siweMessage = new SiweMessage({
    domain: DOMAIN,
    address: wallet.address, // EIP-55 checksum allowed in message
    statement: "Sign in with Ethereum to ChimpHood.",
    uri: URI,
    version: "1",
    chainId: 1,
    nonce,
    issuedAt: now.toISOString(),
  });
  const messageStr = siweMessage.prepareMessage();

  // 3. Wallet signs message
  const signature = await wallet.signMessage(messageStr);

  // 4. Server verifies SIWE login
  const verifyResult = await verifySiweLogin(
    prisma,
    { message: messageStr, signature },
    VERIFY_OPTS,
  );

  return verifyResult;
}

// ---------------------------------------------------------------------------
// Task 5-A Integration Tests Suite
// ---------------------------------------------------------------------------

describe("Task 5-A: Integration Tests Suite (End-to-End User & Admin Flows)", () => {
  let db: ReturnType<typeof createIntegrationDatabase>;
  let prisma: PrismaClient;

  beforeEach(() => {
    db = createIntegrationDatabase();
    prisma = db.client as unknown as PrismaClient;
  });

  // -------------------------------------------------------------------------
  // E2E Flow 1: Full Candidate User Lifecycle: Login -> Claim -> Gift -> Qualify
  // -------------------------------------------------------------------------
  it("executes the full user lifecycle: SIWE Login -> Drop Claim -> Trait Gifting -> Campaign Submission & Review -> Whitelist Qualification -> Drop Invariant Block", async () => {
    const candidateWallet = Wallet.createRandom();
    const friendWallet = Wallet.createRandom();
    const now = new Date("2026-10-23T12:00:00Z");

    // -----------------------------------------------------------------------
    // STEP 1: SIWE Login Flow for Candidate & Friend
    // -----------------------------------------------------------------------
    const candidateLogin = await performSiweLogin(prisma, candidateWallet);
    expect(candidateLogin.address).toBe(candidateWallet.address.toLowerCase());
    expect(candidateLogin.userId).toBeDefined();

    const friendLogin = await performSiweLogin(prisma, friendWallet);
    expect(friendLogin.userId).toBeDefined();

    const candidateUserId = candidateLogin.userId;
    const friendUserId = friendLogin.userId;

    // Link Candidate X (Twitter) Account
    db.store.xIdentities.push({
      id: "x_cand",
      userId: candidateUserId,
      xId: "x_candidate_snowflake",
      username: "chimphood_candidate",
    });

    // -----------------------------------------------------------------------
    // STEP 2: Drop Claim Flow (Candidate acquires traits while non-WL)
    // -----------------------------------------------------------------------
    // Set up a Drop with an open Period and trait pool items
    const dropId = "genesis_drop";
    const periodId = "genesis_period_1";
    const bgTraitId = "trait_bg_jungle";

    db.store.drops.push({
      id: dropId,
      slug: "genesis-drop",
      title: "Genesis Trait Drop",
      status: "ACTIVE",
    });

    db.store.traits.push({
      id: bgTraitId,
      name: "Jungle Background",
      category: "BG",
      rarity: "COMMON",
    });

    db.store.dropPeriods.push({
      id: periodId,
      dropId,
      periodIndex: 1,
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 1000 * 60 * 10), // started 10m ago
      endsAt: new Date(now.getTime() + 1000 * 60 * 20), // ends in 20m
      configLockAt: new Date(now.getTime() - 1000 * 60 * 30),
      isStockLocked: true,
    });

    db.store.dropPoolItems.push({
      id: "pool_item_bg",
      periodId,
      traitId: bgTraitId,
      allocatedStock: 10,
      claimedStock: 0,
      remainingStock: 10,
      weight: 100,
    });

    // Candidate claims drop
    const claimResult = await claimDrop(prisma, {
      userId: candidateUserId,
      dropId,
      periodId,
      now,
    });

    expect(claimResult.claim).toBeDefined();
    expect(claimResult.inventoryItem.ownerId).toBe(candidateUserId);
    expect(claimResult.inventoryItem.traitId).toBe(bgTraitId);
    expect(claimResult.inventoryItem.edition).toBe(1);

    // Verify stock decremented and audit log written
    const poolItem = db.store.dropPoolItems.find((p) => p.id === "pool_item_bg");
    expect(poolItem.remainingStock).toBe(9);
    expect(poolItem.claimedStock).toBe(1);

    const claimAudit = db.store.auditLogs.find((a) => a.action === "DROP_CLAIM_MINTED");
    expect(claimAudit).toBeDefined();
    expect(claimAudit.actorId).toBe(candidateUserId);

    // -----------------------------------------------------------------------
    // STEP 3: Gifting Flow (Candidate gifts a duplicate trait to Friend)
    // -----------------------------------------------------------------------
    // Candidate acquires a duplicate copy of Jungle Background
    const itemDuplicate = {
      id: "inv_bg_2",
      ownerId: candidateUserId,
      traitId: bgTraitId,
      edition: 2,
      isLocked: false,
    };
    db.store.inventoryItems.push(itemDuplicate);

    // Candidate initiates gift to Friend (sender retains edition 1, sends edition 2)
    const giftResult = await sendGift(prisma, {
      senderId: candidateUserId,
      receiverId: friendUserId,
      inventoryItemId: itemDuplicate.id,
      now,
    });
    expect(giftResult.status).toBe("PENDING");
    expect(giftResult.senderId).toBe(candidateUserId);
    expect(giftResult.receiverId).toBe(friendUserId);

    // Verify item is locked during pending gift
    expect(itemDuplicate.isLocked).toBe(true);

    // Friend accepts gift
    const acceptResult = await acceptGift(prisma, {
      userId: friendUserId,
      giftId: giftResult.id,
      now,
    });
    expect(acceptResult.gift.status).toBe("ACCEPTED");
    expect(acceptResult.item.ownerId).toBe(friendUserId);

    // Verify ownership transfer and unlock
    expect(itemDuplicate.ownerId).toBe(friendUserId);
    expect(itemDuplicate.isLocked).toBe(false);

    const giftAudit = db.store.auditLogs.find((a) => a.action === "GIFT_ACCEPTED");
    expect(giftAudit).toBeDefined();

    // -----------------------------------------------------------------------
    // STEP 4: Whitelist Pre-requisites & Campaign Evidence Submission (Task 4-C & 4-D)
    // -----------------------------------------------------------------------
    const programId = "wl_alpha";
    const campaignId = "camp_alpha";
    const versionId = "ver_alpha_1";
    const taskId = "task_community_proof";

    db.store.programs.push({
      id: programId,
      slug: "alpha-wl",
      name: "Alpha Whitelist",
      status: "OPEN",
      totalSlots: 50,
      allocatedSlotsCount: 0,
    });

    db.store.campaigns.push({
      id: campaignId,
      wlProgramId: programId,
      slug: "alpha-campaign",
      title: "Alpha Campaign",
      status: "ACTIVE",
    });

    db.store.campaignVersions.push({
      id: versionId,
      campaignId,
      versionNumber: 1,
      isCurrent: true,
      startsAt: new Date("2026-10-01T00:00:00Z"),
      endsAt: new Date("2026-12-31T23:59:59Z"),
    });

    db.store.campaignTasks.push({
      id: taskId,
      versionId,
      taskCode: "SUBMIT_PROOF",
      title: "Submit Community Contribution Proof",
      taskType: "MANUAL_EVIDENCE",
      points: 25,
      isRequired: true,
      sortOrder: 1,
    });

    // Provide Candidate with remaining required trait categories (FUR, CLOTHING, HEADWEAR, EYEWEAR)
    // (Candidate already has BG from the drop claim)
    ["FUR", "CLOTHING", "HEADWEAR", "EYEWEAR"].forEach((cat, idx) => {
      const traitId = `trait_${cat.toLowerCase()}`;
      db.store.traits.push({
        id: traitId,
        name: `Genesis ${cat}`,
        category: cat,
        rarity: "COMMON",
      });
      db.store.inventoryItems.push({
        id: `inv_${cat.toLowerCase()}_${idx}`,
        ownerId: candidateUserId,
        traitId,
        edition: 1,
        isLocked: false,
      });
    });

    // Candidate qualification before task evidence fails
    const initialQual = await evaluateUserQualification(prisma, {
      programId,
      userId: candidateUserId,
      now,
    });
    expect(initialQual.qualified).toBe(false);
    expect(initialQual.missingRequirements).toContain(
      'Incomplete task: "Submit Community Contribution Proof".',
    );

    // Candidate submits task evidence (Task 4-C)
    const submissionResult = await submitTaskEvidence(prisma, {
      taskId,
      userId: candidateUserId,
      submissionType: "URL",
      payload: "https://x.com/chimphood_candidate/status/5555555555",
      now,
    });
    expect(submissionResult.success).toBe(true);
    expect(submissionResult.submission.status).toBe("PENDING_REVIEW");
    expect(submissionResult.taskProgress.status).toBe("SUBMITTED");

    // Admin reviews and approves evidence (Task 4-D)
    const adminUserId = "admin_reviewer_1";
    db.store.users.push({ id: adminUserId, isBanned: false });

    const reviewResult = await reviewEvidence(prisma, {
      submissionId: submissionResult.submission.id,
      adminUserId,
      status: "APPROVED",
      reviewerNotes: "Verified active contribution.",
      now,
    });
    expect(reviewResult.success).toBe(true);
    expect(reviewResult.submission.status).toBe("APPROVED");
    expect(reviewResult.taskProgress.status).toBe("VERIFIED");

    // -----------------------------------------------------------------------
    // STEP 5: Whitelist Qualification Succeeds (Allocated WL Slot)
    // -----------------------------------------------------------------------
    const qualifiedResult = await evaluateUserQualification(prisma, {
      programId,
      userId: candidateUserId,
      now,
    });

    expect(qualifiedResult.qualified).toBe(true);
    expect(qualifiedResult.phase).toBe("SLOT_ALLOCATED");
    expect(qualifiedResult.slotNumber).toBe(1);
    expect(qualifiedResult.missingRequirements).toEqual([]);

    const wlAudit = db.store.auditLogs.find((a) => a.action === "WL_SLOT_ALLOCATED");
    expect(wlAudit).toBeDefined();

    // -----------------------------------------------------------------------
    // STEP 6: Invariant Enforcement: WL slot holders cannot claim drops
    // -----------------------------------------------------------------------
    const period2Id = "genesis_period_2";
    db.store.dropPeriods.push({
      id: period2Id,
      dropId,
      periodIndex: 2,
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 1000 * 60 * 5),
      endsAt: new Date(now.getTime() + 1000 * 60 * 25),
      configLockAt: new Date(now.getTime() - 1000 * 60 * 30),
      isStockLocked: true,
    });
    db.store.dropPoolItems.push({
      id: "pool_item_bg_p2",
      periodId: period2Id,
      traitId: bgTraitId,
      allocatedStock: 5,
      claimedStock: 0,
      remainingStock: 5,
      weight: 100,
    });

    // Attempting to claim drop while holding active WL slot must fail
    await expect(
      claimDrop(prisma, {
        userId: candidateUserId,
        dropId,
        periodId: period2Id,
        now,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "WL_HOLDER_CLAIM_PROHIBITED",
      }),
    );
  });

  // -------------------------------------------------------------------------
  // E2E Flow 2: Comprehensive Admin Flows
  // -------------------------------------------------------------------------
  it("executes comprehensive admin lifecycle flows: Admin Auth -> Campaign Setup -> Task Setup -> Evidence Review -> Emergency Close -> Slot Revocation & Reconcile -> Ban Enforcement", async () => {
    const adminWallet = Wallet.createRandom();
    const now = new Date("2026-10-23T14:00:00Z");

    // -----------------------------------------------------------------------
    // 1. Admin Authentication & Role Authorization
    // -----------------------------------------------------------------------
    const adminLogin = await performSiweLogin(prisma, adminWallet);
    const adminUserId = adminLogin.userId;

    // Assign Admin Role with all permissions
    db.store.adminRoles.push({
      id: "admin_role_master",
      userId: adminUserId,
      roleType: "ADMIN" as AdminRoleType,
      permissions: [
        "MANAGE_CAMPAIGNS",
        "REVIEW_EVIDENCE",
        "MANAGE_DROPS",
        "MANAGE_WL",
        "MANAGE_BANS",
      ],
      assignedBy: "system",
    });

    // Verify admin session check
    const adminSession = await requireAdminSession(prisma, {
      requiredPermission: "MANAGE_CAMPAIGNS",
      session: {
        sessionId: "test-session-id",
        userId: adminUserId,
        address: adminWallet.address.toLowerCase(),
      },
    });
    expect(adminSession.adminRole.permissions).toContain("MANAGE_CAMPAIGNS");

    // -----------------------------------------------------------------------
    // 2. Admin Campaign & Task Management (Fase 4-A & 4-B)
    // -----------------------------------------------------------------------
    const wlProgramId = "prog_community";
    db.store.programs.push({
      id: wlProgramId,
      slug: "community",
      name: "Community WL Program",
      status: "OPEN",
      totalSlots: 10,
      allocatedSlotsCount: 0,
    });

    // Admin creates Campaign in DRAFT
    const campaignResult = await createCampaign(prisma, {
      slug: "community-ambassador",
      title: "Community Ambassador Campaign",
      description: "Ambassador tasks for WL access",
      wlProgramId,
      adminUserId,
      initialVersion: {
        startsAt: new Date("2026-10-01T00:00:00Z"),
        endsAt: new Date("2026-12-31T23:59:59Z"),
      },
    });
    expect(campaignResult.campaign.status).toBe("DRAFT");
    expect(campaignResult.campaign.currentVersion).toBeDefined();

    // Admin activates Campaign
    const updatedCampaign = await updateCampaign(prisma, {
      campaignId: campaignResult.campaign.id,
      adminUserId,
      status: "ACTIVE",
    });
    expect(updatedCampaign.campaign.status).toBe("ACTIVE");

    // Admin creates Campaign Task
    const taskResult = await createCampaignTask(prisma, {
      campaignId: campaignResult.campaign.id,
      versionIdentifier: String(campaignResult.campaign.currentVersion?.versionNumber),
      adminUserId,
      taskCode: "AMBASSADOR_CONTENT",
      title: "Publish ChimpHood Thread",
      taskType: "MANUAL_EVIDENCE",
      points: 100,
      isRequired: true,
    });
    expect(taskResult.task.taskCode).toBe("AMBASSADOR_CONTENT");

    // -----------------------------------------------------------------------
    // 3. User Evidence Submission & Admin Evidence Review (Task 4-C & 4-D)
    // -----------------------------------------------------------------------
    const userWallet = Wallet.createRandom();
    const userLogin = await performSiweLogin(prisma, userWallet);
    const userId = userLogin.userId;

    const evidenceResult = await submitTaskEvidence(prisma, {
      taskId: taskResult.task.id,
      userId,
      submissionType: "URL",
      payload: "https://x.com/ambassador/status/10000000",
      now,
    });

    // Admin lists pending evidence
    const evidenceList = await listAdminEvidence(prisma, {
      status: "PENDING_REVIEW",
      taskId: taskResult.task.id,
    });
    expect(evidenceList.total).toBe(1);
    expect(evidenceList.submissions[0].id).toBe(evidenceResult.submission.id);

    // Admin reviews and approves evidence
    const reviewResult = await reviewEvidence(prisma, {
      submissionId: evidenceResult.submission.id,
      adminUserId,
      status: "APPROVED",
      reviewerNotes: "Excellent thread on ChimpHood mechanics.",
      now,
    });
    expect(reviewResult.submission.status).toBe("APPROVED");
    expect(reviewResult.taskProgress.status).toBe("VERIFIED");

    // -----------------------------------------------------------------------
    // 4. Emergency Close Drop Period (Task 1-C)
    // -----------------------------------------------------------------------
    const dropId = "admin_emergency_drop";
    const periodId = "period_emergency";
    db.store.drops.push({
      id: dropId,
      slug: "emergency-drop",
      title: "Drop Under Audit",
      status: "ACTIVE",
    });
    db.store.dropPeriods.push({
      id: periodId,
      dropId,
      periodIndex: 1,
      status: "ACTIVE",
      startsAt: new Date(now.getTime() - 1000 * 60 * 10),
      endsAt: new Date(now.getTime() + 1000 * 60 * 50),
      configLockAt: new Date(now.getTime() - 1000 * 60 * 30),
      isStockLocked: true,
    });

    const closeResult = await emergencyCloseDropPeriod(prisma, {
      periodId,
      adminUserId,
      reason: "Suspected automated sybil attack on stock pool.",
      now,
    });
    expect(closeResult.success).toBe(true);
    expect(closeResult.status).toBe("CANCELLED");

    // Subsequent claims on cancelled period fail
    await expect(
      claimDrop(prisma, {
        userId,
        dropId,
        periodId,
        now,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "PERIOD_CANCELLED",
      }),
    );

    // -----------------------------------------------------------------------
    // 5. Admin Slot Revocation & Queue Reconciliation (Task 1-E & 2-B)
    // -----------------------------------------------------------------------
    // User already holds a slot
    const slot = {
      id: "slot_to_revoke",
      programId: wlProgramId,
      userId,
      slotNumber: 1,
      status: "ALLOCATED",
      allocatedBy: "MANUAL",
      allocatedAt: now,
    };
    db.store.slots.push(slot);
    const prog = db.store.programs.find((p) => p.id === wlProgramId);
    prog.allocatedSlotsCount = 1;

    // Another qualified user is waiting in queue
    const queuedUserWallet = Wallet.createRandom();
    const queuedUserLogin = await performSiweLogin(prisma, queuedUserWallet);
    const queuedUserId = queuedUserLogin.userId;

    db.store.queueEntries.push({
      id: "qe_next",
      programId: wlProgramId,
      userId: queuedUserId,
      queueNumber: 1,
      status: "WAITING",
      priorityScore: 100,
      joinedAt: new Date(now.getTime() - 1000 * 60 * 60),
    });

    // Admin revokes slot
    const revokeResult = await revokeWlSlot(prisma, {
      slotId: slot.id,
      adminUserId,
      reason: "Manual admin compliance audit revocation.",
      now,
    });
    expect(revokeResult.success).toBe(true);
    expect(revokeResult.status).toBe("REVOKED_MANUAL_ADMIN");

    // Event-driven queue reconciliation automatically promotes the waiting user (Task O-6)
    const reconciledSlot = db.store.slots.find(
      (s) => s.userId === queuedUserId && s.status === "ALLOCATED",
    );
    expect(reconciledSlot).toBeDefined();
    expect(prog.allocatedSlotsCount).toBe(1);

    // Any manual/subsequent queue reconciliation safely finds no open slots (idempotent no-op)
    const reconcileResult = await reconcileQueueSlots(prisma, wlProgramId, now);
    expect(reconcileResult.slotsFilled).toBe(0);

    // -----------------------------------------------------------------------
    // 6. Admin Ban Enforcement & Ban Revocation (Task 1-D)
    // -----------------------------------------------------------------------
    const badActorWallet = Wallet.createRandom();
    const badActorLogin = await performSiweLogin(prisma, badActorWallet);
    const badActorId = badActorLogin.userId;

    // Admin bans bad actor
    const banResult = await banUser(prisma, {
      userId: badActorId,
      adminUserId,
      scope: "FULL_SYSTEM",
      reason: "Scripted automated botting behavior detected.",
      now,
    });
    expect(banResult.banRecord.isActive).toBe(true);

    // Bad actor attempting to submit evidence is rejected
    await expect(
      submitTaskEvidence(prisma, {
        taskId: taskResult.task.id,
        userId: badActorId,
        payload: "https://proof.example",
        now,
      }),
    ).rejects.toThrowError(
      expect.objectContaining({
        code: "USER_BANNED",
      }),
    );

    // DEC-012: Regular ADMIN cannot revoke permanent ban (strictly rejected with 403 INSUFFICIENT_PRIVILEGE)
    await expect(
      revokeBan(prisma, {
        banId: banResult.banRecord.id,
        adminUserId,
        reason: "Admin attempts to lift permanent ban",
        now,
      }),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_PRIVILEGE",
      status: 403,
    });

    // Only SUPER_ADMIN can revoke permanent bans
    const superAdminRole = db.store.adminRoles.find((a) => a.userId === adminUserId);
    if (superAdminRole) superAdminRole.roleType = "SUPER_ADMIN" as AdminRoleType;
    const adminUser = db.store.users.find((u) => u.id === adminUserId);
    if (adminUser) adminUser.role = "SUPER_ADMIN";

    // Super Admin lifts permanent ban
    const unbanResult = await revokeBan(prisma, {
      banId: banResult.banRecord.id,
      adminUserId,
      reason: "Appeal accepted with KYC verification by Super Admin.",
      now,
    });
    expect(unbanResult.isActive).toBe(false);

    // Bad actor (now unbanned) can submit evidence
    const unbannedSubmission = await submitTaskEvidence(prisma, {
      taskId: taskResult.task.id,
      userId: badActorId,
      payload: "https://proof.example/valid",
      now,
    });
    expect(unbannedSubmission.success).toBe(true);
  });
});

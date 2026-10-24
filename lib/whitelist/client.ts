export interface WhitelistStatusResponse {
  configured: boolean;
  authenticated?: boolean;
  message?: string;
  address?: string;
  program?: {
    id: string;
    slug: string;
    name: string;
    totalSlots: number;
    allocatedSlotsCount: number;
    status: string;
  };
  status?: {
    qualified: boolean;
    phase: "NONE" | "QUALIFIED" | "IN_QUEUE" | "SLOT_ALLOCATED" | "REVOKED";
    qualifiedAt?: string;
    slotNumber?: number;
    queueNumber?: number;
    queueRank?: number;
    missingRequirements: string[];
    details: {
      hasVerifiedWallet: boolean;
      hasLinkedX: boolean;
      xUsername?: string;
      heldCategories: string[];
      missingCategories: string[];
      completedMandatoryTasksCount: number;
      totalMandatoryTasksCount: number;
      isBanned: boolean;
    };
  };
}

export async function fetchWhitelistStatus(
  address?: string,
): Promise<WhitelistStatusResponse> {
  const url = address
    ? `/api/whitelist/status?address=${encodeURIComponent(address)}`
    : "/api/whitelist/status";
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Whitelist status: ${res.statusText}`);
  }
  return res.json();
}

export async function submitWhitelistQualification(programId?: string) {
  const res = await fetch("/api/whitelist/qualify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ programId }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || data.error || "Failed to evaluate qualification.");
  }
  return data;
}

export {
  adminRevokeSlot,
  type AdminRevokeSlotInput,
  adminReconcileQueue,
  type AdminReconcileQueueInput,
  type AdminReconcileQueueResponse,
} from "@/lib/admin/client";

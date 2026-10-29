import React from "react";
import { Lock, Sparkles, Gift, CheckCircle2 } from "lucide-react";
import type { InventoryItemData } from "@/lib/inventory/client";
import { Button } from "@/components/ui/Button";

interface TraitGridProps {
  items: InventoryItemData[];
  onGiftItem?: (item: InventoryItemData) => void;
}

const RARITY_BADGE_STYLES: Record<string, string> = {
  COMMON: "bg-gray-500/10 text-gray-400 border-gray-600/30",
  UNCOMMON: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  RARE: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  EPIC: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  LEGENDARY: "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

export function TraitGrid({ items, onGiftItem }: TraitGridProps) {
  // 1. Identify equipped item per category (lowest edition among available/unlocked items)
  const equippedItemIds = new Set<string>();
  const categoryEquippedCandidate: Record<string, InventoryItemData> = {};

  for (const item of items) {
    if (item.isEquipped) {
      equippedItemIds.add(item.id);
    } else if (!item.isLocked) {
      const cat = item.trait.category;
      const current = categoryEquippedCandidate[cat];
      const timeCurrent = current?.acquiredAt ? new Date(current.acquiredAt).getTime() : 0;
      const timeItem = item.acquiredAt ? new Date(item.acquiredAt).getTime() : 0;
      if (
        !current ||
        item.edition < current.edition ||
        (item.edition === current.edition &&
          (timeItem < timeCurrent || (timeItem === timeCurrent && item.id < current.id)))
      ) {
        categoryEquippedCandidate[cat] = item;
      }
    }
  }

  // If items do not already have isEquipped pre-computed, populate from candidate mapping
  if (equippedItemIds.size === 0) {
    for (const item of Object.values(categoryEquippedCandidate)) {
      equippedItemIds.add(item.id);
    }
  }

  // 2. Count AVAILABLE (unlocked) items per category
  const availableCategoryCounts = items.reduce<Record<string, number>>((acc, item) => {
    if (!item.isLocked) {
      const cat = item.trait.category;
      acc[cat] = (acc[cat] || 0) + 1;
    }
    return acc;
  }, {});

  // 3. Count TOTAL items per category
  const totalCategoryCounts = items.reduce<Record<string, number>>((acc, item) => {
    const cat = item.trait.category;
    acc[cat] = (acc[cat] || 0) + 1;
    return acc;
  }, {});

  // 4. Count copies per traitId to display duplicate badge
  const traitCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.trait.id] = (acc[item.trait.id] || 0) + 1;
    return acc;
  }, {});

  return (
    <div
      data-testid="trait-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    >
      {items.map((item) => {
        const isEquipped = equippedItemIds.has(item.id);
        const availableCount = availableCategoryCounts[item.trait.category] || 0;
        const totalCategoryCount = totalCategoryCounts[item.trait.category] || 0;
        const isEligible = !isEquipped && !item.isLocked && availableCount >= 2;
        const isDuplicateTrait = (traitCounts[item.trait.id] || 0) >= 2;

        return (
          <div
            key={item.id}
            data-testid={`inventory-item-${item.id}`}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-gray-800 bg-[#0d111c] transition-colors hover:border-gray-700"
          >
            {/* Item Image / Fallback Container */}
            <div className="relative aspect-square w-full overflow-hidden bg-gray-900/80">
              {item.trait.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.trait.imageUrl}
                  alt={item.trait.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-gray-600">
                  <Sparkles className="h-10 w-10 opacity-40" />
                </div>
              )}

              {/* Lock Overlay / Indicator */}
              {item.isLocked && (
                <div
                  data-testid="locked-badge"
                  className="absolute top-2 right-2 flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-950/80 px-2 py-0.5 text-xs font-medium text-amber-300 backdrop-blur"
                >
                  <Lock className="h-3 w-3" />
                  <span>Locked</span>
                </div>
              )}

              {/* Equipped / In Use Badge (Top-Left) */}
              {isEquipped ? (
                <div
                  data-testid={`equipped-badge-${item.id}`}
                  className="absolute top-2 left-2 flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-950/80 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur shadow-sm"
                >
                  <Sparkles className="h-3 w-3" />
                  <span>Equipped</span>
                </div>
              ) : isEligible ? (
                /* Category Extra / Duplicate Indicator */
                <div
                  data-testid={`duplicate-badge-${item.id}`}
                  className="absolute top-2 left-2 rounded-full border border-teal-500/30 bg-teal-950/80 px-2 py-0.5 text-[10px] font-medium text-teal-300 backdrop-blur"
                >
                  {isDuplicateTrait
                    ? `Duplicate (${traitCounts[item.trait.id]}x)`
                    : `Extra ${item.trait.category} (${availableCount} avail)`}
                </div>
              ) : null}

              {/* Edition Tag */}
              <div className="absolute bottom-2 left-2 rounded border border-gray-800 bg-gray-950/80 px-2 py-0.5 font-mono text-xs font-medium text-gray-300 backdrop-blur">
                #{item.edition}
              </div>
            </div>

            {/* Item Metadata */}
            <div className="flex flex-1 flex-col justify-between space-y-2 p-3.5">
              <div>
                <div className="mb-1 flex items-center justify-between gap-1">
                  <span className="text-[11px] font-semibold tracking-wider text-gray-400 uppercase">
                    {item.trait.category}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      RARITY_BADGE_STYLES[item.trait.rarity] || RARITY_BADGE_STYLES.COMMON
                    }`}
                  >
                    {item.trait.rarity}
                  </span>
                </div>
                <h4 className="line-clamp-1 text-sm font-semibold text-white">
                  {item.trait.name}
                </h4>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between border-t border-gray-800/80 pt-1 text-[11px] text-gray-500">
                  <span>Via {item.acquiredVia.toLowerCase()}</span>
                  {item.isLocked && item.lockReason && (
                    <span
                      className="max-w-[100px] truncate text-[10px] text-amber-400/80"
                      title={item.lockReason}
                    >
                      {item.lockReason}
                    </span>
                  )}
                </div>

                {/* Bottom Action / Status Indicator */}
                {!onGiftItem || totalCategoryCount < 2 ? (
                  <div
                    data-testid={`single-copy-badge-${item.id}`}
                    className="flex h-8 w-full items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/40 text-[10px] text-gray-500"
                    title={`You must retain at least 1 item in the ${item.trait.category} category. Only extra category items can be gifted.`}
                  >
                    Keep 1 in {item.trait.category} (Category minimum)
                  </div>
                ) : isEquipped ? (
                  availableCount >= 2 ? (
                    <div
                      data-testid={`equipped-action-${item.id}`}
                      className="flex h-8 w-full items-center justify-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-950/40 text-[11px] font-medium text-emerald-400"
                      title="This trait is currently equipped on your Profile avatar and cannot be gifted."
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span>In Use on Profile</span>
                    </div>
                  ) : (
                    <div
                      data-testid={`single-copy-badge-${item.id}`}
                      className="flex h-8 w-full items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/40 text-[10px] text-gray-500"
                      title={`You must retain at least 1 item in the ${item.trait.category} category. Only extra category items can be gifted.`}
                    >
                      Keep 1 in {item.trait.category} (Category minimum)
                    </div>
                  )
                ) : item.isLocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full border-amber-500/30 text-xs text-amber-400 opacity-60 cursor-not-allowed"
                    disabled
                    data-testid={`gift-button-${item.id}`}
                  >
                    <Lock className="mr-1.5 h-3.5 w-3.5" />
                    Locked in Gift
                  </Button>
                ) : isEligible ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 w-full border-teal-500/30 text-xs text-teal-400 hover:border-teal-500/50 hover:bg-teal-500/10 cursor-pointer"
                    onClick={() => onGiftItem(item)}
                    data-testid={`gift-button-${item.id}`}
                  >
                    <Gift className="mr-1.5 h-3.5 w-3.5" />
                    Gift Trait
                  </Button>
                ) : (
                  <div
                    data-testid={`single-copy-badge-${item.id}`}
                    className="flex h-8 w-full items-center justify-center rounded-lg border border-gray-800/80 bg-gray-900/40 text-[10px] text-gray-500"
                    title={`You must retain at least 1 item in the ${item.trait.category} category. Only extra category items can be gifted.`}
                  >
                    Keep 1 in {item.trait.category} (Category minimum)
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

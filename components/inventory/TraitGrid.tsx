import React from "react";
import type { InventoryItemData } from "@/lib/inventory/client";
import { Button } from "@/components/ui/Button";

interface TraitGridProps {
  items: InventoryItemData[];
  onGiftItem?: (item: InventoryItemData) => void;
  onEquipItem?: (item: InventoryItemData) => void;
  equippingItemId?: string | null;
}

const CATEGORY_BADGE_STYLES: Record<string, string> = {
  BG: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  FUR: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  CLOTHING: "border-violet-500/30 bg-violet-500/10 text-violet-400",
  HEADWEAR: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  EYEWEAR: "border-teal-500/30 bg-teal-500/10 text-teal-400",
};

export function TraitGrid({
  items,
  onGiftItem,
  onEquipItem,
  equippingItemId,
}: TraitGridProps) {
  // 1. Identify equipped item per category
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

  // For any category that does not have an explicitly equipped item, fallback to candidate
  for (const [cat, candidate] of Object.entries(categoryEquippedCandidate)) {
    const hasCategoryEquipped = items.some(
      (it) => it.trait.category === cat && equippedItemIds.has(it.id),
    );
    if (!hasCategoryEquipped) {
      equippedItemIds.add(candidate.id);
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
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-2 sm:gap-4 md:grid-cols-3 lg:grid-cols-4"
    >
      {items.map((item) => {
        const isEquipped = equippedItemIds.has(item.id);
        const availableCount = availableCategoryCounts[item.trait.category] || 0;
        const totalCategoryCount = totalCategoryCounts[item.trait.category] || 0;
        const isEligible = !isEquipped && !item.isLocked && availableCount >= 2;
        const isDuplicateTrait = (traitCounts[item.trait.id] || 0) >= 2;
        const isEquipping = equippingItemId === item.id;

        return (
          <div
            key={item.id}
            data-testid={`inventory-item-${item.id}`}
            className="group relative flex flex-col overflow-hidden rounded-xl border border-[#163B44] bg-[#0B2026] transition-colors hover:border-[#163B44]"
          >
            {/* Item Image / Fallback Container */}
            <div className="relative aspect-square w-full overflow-hidden bg-[#0B2026]/90">
              {item.trait.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.trait.imageUrl}
                  alt={item.trait.name}
                  className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-mono uppercase text-gray-500">
                  No Image
                </div>
              )}

              {/* Lock Overlay / Indicator */}
              {item.isLocked && (
                <div
                  data-testid="locked-badge"
                  className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 rounded-full border border-amber-500/30 bg-amber-950/80 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium text-amber-300 backdrop-blur"
                >
                  <span>Locked</span>
                </div>
              )}

              {/* Equipped / In Use Badge (Top-Left) */}
              {isEquipped ? (
                <div
                  data-testid={`equipped-badge-${item.id}`}
                  className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 rounded-full border border-emerald-500/40 bg-emerald-950/80 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-semibold text-emerald-300 backdrop-blur shadow-sm"
                >
                  <span>Equipped</span>
                </div>
              ) : isEligible ? (
                /* Category Extra / Duplicate Indicator */
                <div
                  data-testid={`duplicate-badge-${item.id}`}
                  className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 max-w-[calc(100%-12px)] truncate rounded-full border border-teal-500/30 bg-teal-950/80 px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-medium text-teal-300 backdrop-blur"
                >
                  {isDuplicateTrait
                    ? `Duplicate (${traitCounts[item.trait.id]}x)`
                    : `Extra ${item.trait.category} (${availableCount} avail)`}
                </div>
              ) : null}

              {/* Edition Tag */}
              <div className="absolute bottom-1.5 left-1.5 sm:bottom-2 sm:left-2 rounded border border-[#163B44] bg-[#04181C]/90 px-1.5 sm:px-2 py-0.5 font-mono text-[10px] sm:text-xs font-medium text-gray-300 backdrop-blur">
                #{item.edition}
              </div>
            </div>

            {/* Item Metadata */}
            <div className="flex flex-1 flex-col justify-between space-y-2 p-2.5 sm:p-3.5">
              <div>
                <div className="mb-1 sm:mb-1.5 flex items-center justify-between gap-1">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 sm:px-2.5 py-0.5 text-[10px] sm:text-xs font-bold tracking-wider uppercase ${
                      CATEGORY_BADGE_STYLES[item.trait.category] || "border-[#163B44] bg-[#102B33] text-gray-300"
                    }`}
                  >
                    {item.trait.category}
                  </span>
                </div>
                <h4 className="line-clamp-1 text-xs sm:text-sm font-semibold text-white">
                  {item.trait.name}
                </h4>
              </div>

              <div className="space-y-1.5 sm:space-y-2">
                <div className="flex items-center justify-between border-t border-[#163B44] pt-1 text-[10px] sm:text-xs text-gray-400">
                  <span>Via {item.acquiredVia.toLowerCase()}</span>
                  {item.isLocked && item.lockReason && (
                    <span
                      className="max-w-[90px] sm:max-w-[120px] truncate text-[10px] sm:text-xs text-amber-400/80"
                      title={item.lockReason}
                    >
                      {item.lockReason}
                    </span>
                  )}
                </div>

                {/* Bottom Action / Status Indicator */}
                {isEquipped ? (
                  <div
                    data-testid={`equipped-action-${item.id}`}
                    className="flex h-7 sm:h-8 w-full items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-950/50 text-[10px] sm:text-xs font-semibold text-emerald-300 shadow-sm uppercase tracking-wide px-1"
                    title={
                      availableCount < 2
                        ? `This trait is currently equipped on your Profile avatar. You must retain at least 1 item in the ${item.trait.category} category.`
                        : "This trait is currently equipped on your Profile avatar and cannot be gifted."
                    }
                  >
                    <span>In Use on Profile</span>
                  </div>
                ) : item.isLocked ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 sm:h-8 w-full border-amber-500/30 text-[10px] sm:text-xs text-amber-400 opacity-60 cursor-not-allowed uppercase tracking-wide px-1"
                    disabled
                    data-testid={totalCategoryCount < 2 ? `locked-badge-${item.id}` : `gift-button-${item.id}`}
                  >
                    Locked in Gift
                  </Button>
                ) : (
                  <div className="flex items-center gap-1.5 sm:gap-2 w-full">
                    {onEquipItem && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 sm:h-8 ${isEligible && onGiftItem ? "flex-1" : "w-full"} border-teal-500/40 text-[10px] sm:text-xs font-bold text-teal-300 hover:border-teal-400 hover:bg-teal-500/20 cursor-pointer shadow-sm transition-all uppercase tracking-wide px-1`}
                        onClick={() => onEquipItem(item)}
                        disabled={isEquipping}
                        data-testid={`equip-button-${item.id}`}
                      >
                        {isEquipping ? "Equipping..." : "Equip"}
                      </Button>
                    )}
                    {isEligible && onGiftItem && (
                      <Button
                        size="sm"
                        variant="outline"
                        className={`h-7 sm:h-8 ${onEquipItem ? "flex-1" : "w-full"} border-teal-500/40 text-[10px] sm:text-xs font-bold text-teal-300 hover:border-teal-400 hover:bg-teal-500/20 cursor-pointer shadow-sm transition-all uppercase tracking-wide px-1`}
                        onClick={() => onGiftItem(item)}
                        data-testid={`gift-button-${item.id}`}
                      >
                        Gift Trait
                      </Button>
                    )}
                    {!onEquipItem && !isEligible && (
                      <div
                        data-testid={`single-copy-badge-${item.id}`}
                        className="flex h-7 sm:h-8 w-full items-center justify-center rounded-lg border border-[#163B44] bg-[#051D22]/60 text-[9px] sm:text-xs text-gray-400 font-medium px-1 text-center truncate"
                        title={`You must retain at least 1 item in the ${item.trait.category} category. Only extra category items can be gifted.`}
                      >
                        Keep 1 in {item.trait.category} (Category minimum)
                      </div>
                    )}
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

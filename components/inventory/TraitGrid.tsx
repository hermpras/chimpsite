import React from "react";
import { Lock, Sparkles } from "lucide-react";
import type { InventoryItemData } from "@/lib/inventory/client";

interface TraitGridProps {
  items: InventoryItemData[];
}

const RARITY_BADGE_STYLES: Record<string, string> = {
  COMMON: "bg-gray-500/10 text-gray-400 border-gray-600/30",
  UNCOMMON: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
  RARE: "bg-sky-500/10 text-sky-400 border-sky-500/30",
  EPIC: "bg-purple-500/10 text-purple-400 border-purple-500/30",
  LEGENDARY: "bg-amber-500/10 text-amber-300 border-amber-500/30",
};

export function TraitGrid({ items }: TraitGridProps) {
  return (
    <div
      data-testid="trait-grid"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
    >
      {items.map((item) => (
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
          </div>
        </div>
      ))}
    </div>
  );
}

import React from "react";
import { AlertCircle } from "lucide-react";

interface PlaceholderNoticeProps {
  title?: string;
  description: string;
  phase?: string;
  className?: string;
}

export function PlaceholderNotice({
  title = "Feature Inactive (Placeholder)",
  description,
  phase = "Upcoming Stage",
  className = "",
}: PlaceholderNoticeProps) {
  return (
    <div
      className={`rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-amber-200 ${className}`}
      role="status"
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-400" />
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-amber-300">{title}</span>
            <span className="rounded bg-amber-400/20 px-2 py-0.5 text-xs font-medium text-amber-300">
              {phase}
            </span>
          </div>
          <p className="leading-relaxed text-amber-200/80">{description}</p>
        </div>
      </div>
    </div>
  );
}

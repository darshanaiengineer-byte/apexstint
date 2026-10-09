import type { TimelineSegment } from "@/lib/data/derive";
import { COMPOUND_META, compoundStyle } from "@/components/compound";
import { cn } from "@/lib/utils";

/** Compact, non-interactive stint bar (used on cards and strategy previews). */
export function StintStrip({
  segments,
  totalLaps,
  className,
  showLetters = true,
}: {
  segments: Pick<TimelineSegment, "lapStart" | "lapEnd" | "compound">[];
  totalLaps: number;
  className?: string;
  showLetters?: boolean;
}) {
  const label = segments
    .map((s) => `${s.compound ? COMPOUND_META[s.compound].label : "Unknown"} laps ${s.lapStart}–${s.lapEnd}`)
    .join(", ");
  return (
    <div className={cn("relative flex h-5 w-full gap-[2px] overflow-hidden rounded-[4px]", className)} role="img" aria-label={label}>
      {segments.map((s, i) => {
        const width = ((s.lapEnd - s.lapStart + 1) / totalLaps) * 100;
        return (
          <div
            key={i}
            className={cn("flex h-full items-center justify-start overflow-hidden px-1.5 font-mono text-[10px] font-bold", !s.compound && "hatch")}
            style={{ width: `${width}%`, ...compoundStyle(s.compound) }}
          >
            {showLetters && width > 6 ? (s.compound ? COMPOUND_META[s.compound].letter : "?") : null}
          </div>
        );
      })}
    </div>
  );
}

import type { Compound } from "@/lib/data/schema";
import { cn } from "@/lib/utils";

export const COMPOUND_META: Record<Compound, { letter: string; label: string; bg: string; ink: string }> = {
  SOFT: { letter: "S", label: "Soft", bg: "var(--tyre-soft)", ink: "#fff" },
  MEDIUM: { letter: "M", label: "Medium", bg: "var(--tyre-medium)", ink: "#1b1c20" },
  HARD: { letter: "H", label: "Hard", bg: "var(--tyre-hard)", ink: "var(--tyre-hard-ink)" },
  INTERMEDIATE: { letter: "I", label: "Intermediate", bg: "var(--tyre-inter)", ink: "#fff" },
  WET: { letter: "W", label: "Wet", bg: "var(--tyre-wet)", ink: "#fff" },
};

export function compoundStyle(c: Compound | null): { backgroundColor: string; color: string } {
  if (!c) return { backgroundColor: "var(--tyre-unknown)", color: "#fff" };
  return { backgroundColor: COMPOUND_META[c].bg, color: COMPOUND_META[c].ink };
}

/** Circular tyre chip: colour + letter so identity never relies on colour alone. */
export function CompoundDot({ compound, className, title }: { compound: Compound | null; className?: string; title?: string }) {
  const meta = compound ? COMPOUND_META[compound] : null;
  return (
    <span
      title={title ?? meta?.label ?? "Unknown compound"}
      aria-label={meta?.label ?? "Unknown compound"}
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold ring-1 ring-inset ring-black/15",
        !compound && "hatch",
        className,
      )}
      style={compoundStyle(compound)}
    >
      {meta?.letter ?? "?"}
    </span>
  );
}

export function CompoundLegend({ compounds, showUnknown }: { compounds: Compound[]; showUnknown?: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Tyre compound legend">
      {compounds.map((c) => (
        <li key={c} className="flex items-center gap-1.5">
          <CompoundDot compound={c} />
          {COMPOUND_META[c].label}
        </li>
      ))}
      {showUnknown && (
        <li className="flex items-center gap-1.5">
          <CompoundDot compound={null} />
          Unknown / derived from pit laps
        </li>
      )}
    </ul>
  );
}

"use client";

import { useMemo, useState } from "react";
import type { TimelineSegment } from "@/lib/data/derive";
import { COMPOUND_META, CompoundDot, CompoundLegend, compoundStyle } from "@/components/compound";
import type { Compound } from "@/lib/data/schema";
import { fmtLapMs } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface TimelineRow {
  driverId: string;
  code: string;
  name: string;
  team: string;
  positionText: string;
  lapsDone: number | null;
  segments: TimelineSegment[];
  pitStops: { lap: number; durationMs: number | null; stoppage: boolean; long: boolean }[];
}

type Focus = { driverId: string; segment: TimelineSegment } | { driverId: string; stop: TimelineRow["pitStops"][number] } | null;

export function StintTimeline({ rows, totalLaps }: { rows: TimelineRow[]; totalLaps: number }) {
  const [focus, setFocus] = useState<Focus>(null);
  const ticks = useMemo(() => {
    const step = totalLaps > 40 ? 10 : 5;
    const t = [1];
    for (let l = step; l < totalLaps; l += step) t.push(l);
    t.push(totalLaps);
    return t;
  }, [totalLaps]);

  const compounds = useMemo(() => {
    const set = new Set<Compound>();
    let unknown = false;
    rows.forEach((r) => r.segments.forEach((s) => (s.compound ? set.add(s.compound) : (unknown = true))));
    return { list: (Object.keys(COMPOUND_META) as Compound[]).filter((c) => set.has(c)), unknown };
  }, [rows]);

  // Lap L occupies [L-1, L) of totalLaps on the axis.
  const pct = (lapBoundary: number) => (lapBoundary / totalLaps) * 100;
  const focusRow = focus ? rows.find((r) => r.driverId === focus.driverId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CompoundLegend compounds={compounds.list} showUnknown={compounds.unknown} />
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-block h-3 w-[3px] rounded-sm bg-foreground" aria-hidden /> recorded pit stop
          <span className="ml-2 inline-block h-3 w-[3px] rounded-sm bg-destructive" aria-hidden /> red-flag stoppage (&gt;10 min in pit lane)
        </p>
      </div>

      {/* Detail readout: updated on hover or keyboard focus. */}
      <div className="min-h-12 rounded-lg border bg-muted/40 px-4 py-2.5 text-sm" aria-live="polite">
        {focus && focusRow ? (
          "segment" in focus ? (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-semibold">{focusRow.code}</span>
              <span className="flex items-center gap-1.5">
                <CompoundDot compound={focus.segment.compound} />
                {focus.segment.compound ? COMPOUND_META[focus.segment.compound].label : "Unknown compound"}
              </span>
              <span className="tabular text-muted-foreground">
                Stint {focus.segment.stint} · laps {focus.segment.lapStart}–{focus.segment.lapEnd} ({focus.segment.lapEnd - focus.segment.lapStart + 1} laps)
              </span>
              <span className="tabular text-muted-foreground">Tyre age at fit: {focus.segment.tyreAgeAtStart ?? "not recorded"}</span>
              {focus.segment.origin === "pit-stops" && (
                <span className="text-xs text-muted-foreground">(bounded by pit-stop laps; compound not recorded)</span>
              )}
            </p>
          ) : (
            <p className="flex flex-wrap items-center gap-x-3">
              <span className="font-semibold">{focusRow.code}</span>
              <span className="tabular">Pit stop on lap {focus.stop.lap}</span>
              <span className="tabular text-muted-foreground">Pit-lane time {fmtLapMs(focus.stop.durationMs)}</span>
              {focus.stop.stoppage && <span className="text-destructive">Red-flag stoppage — not a normal stop</span>}
              {focus.stop.long && <span className="text-amber-700 dark:text-amber-400">Long stop (over 60 s)</span>}
            </p>
          )
        ) : (
          <p className="text-muted-foreground">Hover or tab through the bars for stint details.</p>
        )}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[640px]">
          <div className="grid grid-cols-[6.5rem_1fr] items-end gap-3 pb-1">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Driver</span>
            <div className="relative h-5" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="absolute -translate-x-1/2 font-mono text-[10px] tabular text-muted-foreground" style={{ left: `${pct(t - 0.5)}%` }}>
                  {t}
                </span>
              ))}
            </div>
          </div>
          <ol className="space-y-1">
            {rows.map((row) => (
              <li
                key={row.driverId}
                className={cn("grid grid-cols-[6.5rem_1fr] items-center gap-3 rounded-md", focus?.driverId === row.driverId && "bg-accent/60")}
              >
                <div className="flex items-center gap-2 truncate pl-1 text-sm">
                  <span className="w-6 text-right font-mono text-xs tabular text-muted-foreground">{row.positionText}</span>
                  <span className="font-semibold" title={`${row.name} · ${row.team}`}>
                    {row.code}
                  </span>
                </div>
                <div className="relative h-6">
                  {ticks.slice(1, -1).map((t) => (
                    <span key={t} className="absolute inset-y-0 w-px bg-[var(--grid)]" style={{ left: `${pct(t - 0.5)}%` }} aria-hidden />
                  ))}
                  {row.segments.length === 0 && (
                    <span className="absolute inset-y-0 left-1 flex items-center text-xs text-muted-foreground">
                      {row.lapsDone === 0 ? "Did not complete a lap" : "No stint or pit data"}
                    </span>
                  )}
                  {row.segments.map((s) => {
                    const left = pct(s.lapStart - 1);
                    const width = pct(s.lapEnd - s.lapStart + 1);
                    const label = `${row.code} stint ${s.stint}: ${s.compound ? COMPOUND_META[s.compound].label : "unknown compound"}, laps ${s.lapStart} to ${s.lapEnd}`;
                    const show = () => setFocus({ driverId: row.driverId, segment: s });
                    return (
                      <button
                        key={s.stint}
                        type="button"
                        aria-label={label}
                        onMouseEnter={show}
                        onFocus={show}
                        onClick={show}
                        className={cn(
                          "absolute top-0.5 bottom-0.5 flex items-center overflow-hidden rounded-[4px] border-2 border-transparent px-1 font-mono text-[10px] font-bold outline-none transition-[filter]",
                          "hover:brightness-110 focus-visible:border-ring",
                          !s.compound && "hatch",
                        )}
                        style={{ left: `calc(${left}% + 1px)`, width: `calc(${width}% - 2px)`, ...compoundStyle(s.compound) }}
                      >
                        {width > 4 ? (s.compound ? COMPOUND_META[s.compound].letter : "?") : null}
                      </button>
                    );
                  })}
                  {row.pitStops.map((p, i) => {
                    const show = () => setFocus({ driverId: row.driverId, stop: p });
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={`${row.code} pit stop on lap ${p.lap}${p.stoppage ? " (red-flag stoppage)" : p.long ? " (long stop)" : ""}`}
                        onMouseEnter={show}
                        onFocus={show}
                        onClick={show}
                        className={cn(
                          "absolute -top-0.5 -bottom-0.5 w-[3px] -translate-x-1/2 rounded-sm outline-none ring-2 ring-card focus-visible:ring-ring",
                          p.stoppage ? "bg-destructive" : "bg-foreground",
                        )}
                        style={{ left: `${pct(p.lap)}%` }}
                      />
                    );
                  })}
                  {row.lapsDone != null && row.lapsDone > 0 && row.segments.length > 0 && row.lapsDone < totalLaps && (
                    <span
                      className="absolute inset-y-0 flex items-center whitespace-nowrap pl-2 text-[10px] uppercase tracking-wider text-muted-foreground"
                      style={{ left: `${pct(row.lapsDone)}%` }}
                    >
                      {row.lapsDone} laps
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

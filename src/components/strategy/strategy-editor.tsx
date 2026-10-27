"use client";

import { Plus, Trash2, X } from "lucide-react";
import { COMPOUNDS, type Compound } from "@/lib/data/schema";
import { MAX_STINTS, moveStop, stopLapsFromStints, type SimResult, type Strategy, type StrategyStint } from "@/lib/sim/model";
import { COMPOUND_META, CompoundDot } from "@/components/compound";
import { StintStrip } from "@/components/race/stint-strip";
import { SERIES_DASH, SERIES_SLOTS } from "@/components/charts/series";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { NumberField } from "@/components/ui/number-field";
import { fmtPosition } from "@/lib/format";
import { LIMITS, fieldLimits } from "@/lib/sim/contract";
import { cn } from "@/lib/utils";
import { strategySlot, type LabDriver } from "./types";

export function StrategyEditor({
  strategy,
  result,
  totalLaps,
  drivers,
  showWet,
  canRemove,
  onChange,
  onRemove,
}: {
  strategy: Strategy;
  result: SimResult | undefined;
  totalLaps: number;
  drivers: LabDriver[];
  showWet: boolean;
  canRemove: boolean;
  onChange: (s: Strategy) => void;
  onRemove: () => void;
}) {
  const slot = strategySlot(strategy.id);
  const stops = stopLapsFromStints(strategy.stints);
  const covered = strategy.stints.reduce((a, s) => a + s.laps, 0);
  const compoundOptions = COMPOUNDS.filter((c) => showWet || ["SOFT", "MEDIUM", "HARD"].includes(c) || strategy.stints.some((s) => s.compound === c));
  const loadable = drivers.filter((d) => d.recorded.ok);

  const setStints = (stints: StrategyStint[]) => onChange({ ...strategy, stints });
  const patchStint = (i: number, patch: Partial<StrategyStint>) => setStints(strategy.stints.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const addStint = () => {
    if (strategy.stints.length >= MAX_STINTS) return;
    // Split the longest stint in two so the race distance stays whole.
    const idx = strategy.stints.reduce((best, s, i, arr) => (s.laps > arr[best].laps ? i : best), 0);
    const target = strategy.stints[idx];
    if (!target || target.laps < 2) {
      setStints([...strategy.stints, { compound: "HARD", laps: Math.max(1, totalLaps - covered), tyreAgeAtStart: 0, freeStop: false }]);
      return;
    }
    const first = Math.ceil(target.laps / 2);
    const next: StrategyStint = { compound: target.compound === "HARD" ? "MEDIUM" : "HARD", laps: target.laps - first, tyreAgeAtStart: 0, freeStop: false };
    const stints = [...strategy.stints];
    stints.splice(idx, 1, { ...target, laps: first }, next);
    setStints(stints);
  };

  const removeStint = (i: number) => {
    if (strategy.stints.length <= 1) return;
    const removed = strategy.stints[i];
    const stints = strategy.stints.filter((_, j) => j !== i);
    // Hand the laps to the neighbouring stint so the distance is preserved.
    const into = i > 0 ? i - 1 : 0;
    stints[into] = { ...stints[into], laps: stints[into].laps + removed.laps };
    stints[0] = { ...stints[0], freeStop: false };
    setStints(stints);
  };

  const loadRecorded = (driverId: string) => {
    const d = drivers.find((x) => x.driverId === driverId);
    if (d?.recorded.ok) onChange({ ...strategy, name: `${d.code} as raced`, stints: d.recorded.stints.map((s) => ({ ...s })) });
  };

  const segments: { lapStart: number; lapEnd: number; compound: Compound }[] = [];
  for (const s of strategy.stints) {
    if (s.laps < 1) continue;
    const start = (segments.at(-1)?.lapEnd ?? 0) + 1;
    segments.push({ lapStart: start, lapEnd: start + s.laps - 1, compound: s.compound });
  }
  const cursor = segments.at(-1)?.lapEnd ?? 0;

  return (
    <section className="flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4" aria-label={`Strategy ${strategy.name}`}>
      <div className="flex items-center gap-2">
        <svg width="22" height="8" aria-hidden className="shrink-0">
          <line x1="0" y1="4" x2="22" y2="4" stroke={SERIES_SLOTS[slot]} strokeWidth="3" strokeDasharray={SERIES_DASH[slot]} />
        </svg>
        <Input
          aria-label="Strategy name"
          value={strategy.name}
          maxLength={40}
          onChange={(e) => onChange({ ...strategy, name: e.target.value })}
          className="h-8 border-transparent bg-transparent px-1 font-display text-lg font-semibold uppercase tracking-wide shadow-none hover:border-input dark:bg-transparent"
        />
        {canRemove && (
          <Button variant="ghost" size="icon-sm" onClick={onRemove} aria-label={`Remove strategy ${strategy.name}`}>
            <Trash2 />
          </Button>
        )}
      </div>

      <StintStrip totalLaps={Math.max(totalLaps, cursor)} segments={segments} className="h-6" />

      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_4.25rem_4.25rem_2rem] gap-2 text-[11px] uppercase tracking-wider text-muted-foreground">
          <span>Compound</span>
          <span title="Stint length in laps">Laps</span>
          <span title="Laps already on the tyre when fitted">Age</span>
          <span className="sr-only">Remove</span>
        </div>
        <ol className="space-y-2">
          {strategy.stints.map((s, i) => (
            <li key={i} className="space-y-1.5">
              <div className="grid grid-cols-[1fr_4.25rem_4.25rem_2rem] items-center gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <CompoundDot compound={s.compound} />
                  <NativeSelect
                    aria-label={`Stint ${i + 1} compound`}
                    value={s.compound}
                    onChange={(e) => patchStint(i, { compound: e.target.value as Compound })}
                    className="min-w-0 flex-1"
                  >
                    {compoundOptions.map((c) => (
                      <option key={c} value={c}>
                        {COMPOUND_META[c].label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>
                <NumberField aria-label={`Stint ${i + 1} length in laps`} value={s.laps} {...fieldLimits(LIMITS.stintLaps)} onCommit={(v) => v != null && patchStint(i, { laps: v })} />
                <NumberField
                  aria-label={`Stint ${i + 1} tyre age at fitting`}
                  value={s.tyreAgeAtStart}
                  {...fieldLimits(LIMITS.tyreAgeAtStart)}
                  onCommit={(v) => v != null && patchStint(i, { tyreAgeAtStart: v })}
                />
                <Button variant="ghost" size="icon-sm" disabled={strategy.stints.length <= 1} onClick={() => removeStint(i)} aria-label={`Remove stint ${i + 1}`}>
                  <X />
                </Button>
              </div>
              {i < strategy.stints.length - 1 && (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-l-2 border-dashed border-border py-0.5 pl-3 text-xs text-muted-foreground">
                  <label className="flex items-center gap-1.5">
                    Stop {i + 1} on lap
                    <NumberField
                      aria-label={`Stop ${i + 1} lap`}
                      value={stops[i]}
                      {...fieldLimits(LIMITS.stintLaps)}
                      className="h-7 w-16 text-xs"
                      onCommit={(v) => v != null && setStints(moveStop(strategy.stints, i, v))}
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5" title="No pit loss is charged for this stop (e.g. tyres changed under a red flag)">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-[var(--signal)]"
                      checked={strategy.stints[i + 1].freeStop}
                      onChange={(e) => patchStint(i + 1, { freeStop: e.target.checked })}
                    />
                    free stop (red flag)
                  </label>
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={addStint} disabled={strategy.stints.length >= MAX_STINTS}>
          <Plus /> Add stop
        </Button>
        {loadable.length > 0 && (
          <NativeSelect aria-label="Load a driver's recorded strategy" value="" onChange={(e) => loadRecorded(e.target.value)} className="min-w-40 flex-1">
            <option value="">Load recorded strategy…</option>
            {loadable.map((d) => (
              <option key={d.driverId} value={d.driverId}>
                {d.code} ({fmtPosition(d.positionText)})
              </option>
            ))}
          </NativeSelect>
        )}
      </div>

      <p className={cn("font-mono text-xs tabular", covered === totalLaps ? "text-muted-foreground" : "text-destructive")}>
        {covered}/{totalLaps} laps · {strategy.stints.length - 1} stop{strategy.stints.length === 2 ? "" : "s"}
      </p>

      {result && (result.errors.length > 0 || result.warnings.length > 0) && (
        <ul className="space-y-1 text-xs">
          {result.errors.map((e) => (
            <li key={e} className="text-destructive" role="alert">
              ✕ {e}
            </li>
          ))}
          {result.warnings.map((w) => (
            <li key={w} className="text-amber-700 dark:text-amber-400">
              ⚠ {w}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Link2, Plus, RotateCcw } from "lucide-react";
import { COMPOUNDS, type Compound } from "@/lib/data/schema";
import { evenStints, type Assumptions, type CompoundModel, type Strategy } from "@/lib/sim/model";
import { runExperiment } from "@/lib/sim/experiment";
import { encodeLabState, type LabState } from "@/lib/share/url-state";
import { fmtPosition } from "@/lib/format";
import { LIMITS, MAX_STRATEGIES, fieldLimits } from "@/lib/sim/contract";
import { COMPOUND_META, CompoundDot } from "@/components/compound";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { NumberField } from "@/components/ui/number-field";
import { Callout } from "@/components/site/states";
import { ResultsPanel } from "./results-panel";
import { StrategyEditor } from "./strategy-editor";
import { STRATEGY_IDS, type LabDriver } from "./types";

export interface LabProps {
  raceId: string;
  /** Content hash of the race file (provenance for every experiment run in the lab). */
  datasetVersion: string;
  totalLaps: number;
  drivers: LabDriver[];
  defaults: LabState;
  initial: LabState;
  shareStatus: "none" | "loaded" | "stale" | "invalid";
  /** Dataset version a stale shared link was created with. */
  staleFrom?: string | null;
}

const DRY: Compound[] = ["SOFT", "MEDIUM", "HARD"];

export function StrategyLab({ raceId, datasetVersion, totalLaps, drivers, defaults, initial, shareStatus, staleFrom }: LabProps) {
  const [state, setState] = useState<LabState>(initial);
  const [showWet, setShowWet] = useState(() => initial.strategies.some((s) => s.stints.some((t) => !DRY.includes(t.compound))));
  const [copied, setCopied] = useState(false);
  const [manualLink, setManualLink] = useState<string | null>(null);
  const [notice, setNotice] = useState(shareStatus);

  const refDriver = drivers.find((d) => d.driverId === state.driverId);
  // One deterministic, identifiable experiment per lab state (same inputs ⇒ same id ⇒ same results).
  const experiment = useMemo(
    () => runExperiment({ raceId, datasetVersion, totalLaps, assumptions: state.assumptions, strategies: state.strategies }),
    [raceId, datasetVersion, totalLaps, state.assumptions, state.strategies],
  );
  const { results, report } = experiment;
  const encoded = useMemo(() => encodeLabState(state), [state]);
  const defaultEncoded = useMemo(() => encodeLabState(defaults), [defaults]);
  const isDefault = encoded !== null && encoded === defaultEncoded;

  // Keep the URL in sync so the current setup is always shareable (debounced, no history spam).
  // A state that can't be encoded drops cfg rather than leaving a link to a different setup.
  useEffect(() => {
    const t = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (isDefault || encoded === null) url.searchParams.delete("cfg");
      else url.searchParams.set("cfg", encoded);
      window.history.replaceState(window.history.state, "", url);
    }, 250);
    return () => window.clearTimeout(t);
  }, [encoded, isDefault]);

  const setAssumptions = (patch: Partial<Assumptions>) => setState((s) => ({ ...s, assumptions: { ...s.assumptions, ...patch } }));
  const setCompound = (c: Compound, patch: Partial<CompoundModel>) =>
    setState((s) => ({
      ...s,
      assumptions: { ...s.assumptions, compounds: { ...s.assumptions.compounds, [c]: { ...s.assumptions.compounds[c], ...patch } } },
    }));
  const setStrategy = (next: Strategy) => setState((s) => ({ ...s, strategies: s.strategies.map((x) => (x.id === next.id ? next : x)) }));
  const removeStrategy = (id: string) => setState((s) => ({ ...s, strategies: s.strategies.filter((x) => x.id !== id) }));
  const addStrategy = () =>
    setState((s) => {
      const id = STRATEGY_IDS.find((i) => !s.strategies.some((x) => x.id === i));
      if (!id) return s;
      return { ...s, strategies: [...s.strategies, { id, name: "1-stop S–H", stints: evenStints(totalLaps, ["SOFT", "HARD"]) }] };
    });

  const changeDriver = (driverId: string) => {
    const d = drivers.find((x) => x.driverId === driverId);
    if (!d) return;
    // The base lap is derived from the reference driver, so it follows the selection.
    setState((s) => ({ ...s, driverId, assumptions: { ...s.assumptions, baseLapSec: d.defaults.baseLapSec } }));
  };

  const share = async () => {
    if (encoded === null) return;
    const url = new URL(window.location.href);
    url.searchParams.set("cfg", encoded);
    try {
      await navigator.clipboard.writeText(url.toString());
      setManualLink(null);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context or permission denied): show the link to copy by hand.
      setManualLink(url.toString());
    }
  };

  const baseChanged = refDriver != null && Math.abs(state.assumptions.baseLapSec - refDriver.defaults.baseLapSec) > 1e-9;
  const pitChanged = refDriver != null && Math.abs(state.assumptions.pitLossSec - refDriver.defaults.pitLossSec) > 1e-9;
  const compoundsShown = COMPOUNDS.filter((c) => showWet || DRY.includes(c));

  return (
    <div className="space-y-6">
      {notice === "loaded" && (
        <Callout tone="hypo" title="Loaded from a shared link">
          These strategies and assumptions came from the URL.{" "}
          <button className="underline underline-offset-2" onClick={() => setNotice("none")}>
            Dismiss
          </button>
        </Callout>
      )}
      {notice === "stale" && (
        <Callout tone="warn" title="Shared link made with an older dataset">
          This link was created against dataset <code>{staleFrom}</code>; this race now uses <code>{datasetVersion}</code>. The inputs were loaded,
          but the recorded data has changed, so derived defaults and comparisons may differ from what the sender saw.{" "}
          <button className="underline underline-offset-2" onClick={() => setNotice("none")}>
            Dismiss
          </button>
        </Callout>
      )}
      {notice === "invalid" && (
        <Callout tone="warn" title="Shared link couldn’t be read">
          The <code>cfg</code> parameter was malformed, out of range or referenced an unknown driver, so the defaults were loaded instead.{" "}
          <button className="underline underline-offset-2" onClick={() => setNotice("none")}>
            Dismiss
          </button>
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start" aria-label="Model inputs">
          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Race inputs{" "}
                {refDriver?.defaults.baseLapFromData && refDriver.defaults.pitLossFromData ? (
                  <Badge variant="recorded">From data</Badge>
                ) : (
                  <Badge variant="hypo">Placeholder</Badge>
                )}
              </CardTitle>
              <CardDescription>Defaults derived from recorded data. Once edited, they become your assumptions.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="ref-driver">Reference driver</Label>
                <NativeSelect id="ref-driver" value={state.driverId} onChange={(e) => changeDriver(e.target.value)}>
                  {drivers.map((d) => (
                    // Drivers without clean laps would need an invented base lap, so they can't be the reference.
                    <option key={d.driverId} value={d.driverId} disabled={!d.defaults.baseLapFromData && d.driverId !== state.driverId}>
                      {fmtPosition(d.positionText)} · {d.code} — {d.name}
                      {d.defaults.baseLapFromData ? "" : " (no clean laps)"}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="base-lap" className="justify-between">
                  Base lap (s) {baseChanged ? <Badge variant="hypo">edited</Badge> : null}
                </Label>
                <NumberField id="base-lap" value={state.assumptions.baseLapSec} {...fieldLimits(LIMITS.baseLapSec)} onCommit={(v) => v != null && setAssumptions({ baseLapSec: v })} />
                <p className="text-xs text-muted-foreground">
                  {refDriver?.defaults.baseLapSource}.{" "}
                  {baseChanged && refDriver && (
                    <button className="underline underline-offset-2" onClick={() => setAssumptions({ baseLapSec: refDriver.defaults.baseLapSec })}>
                      Reset to {refDriver.defaults.baseLapSec.toFixed(3)}
                    </button>
                  )}
                </p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pit-loss" className="justify-between">
                  Pit loss per stop (s) {pitChanged ? <Badge variant="hypo">edited</Badge> : null}
                </Label>
                <NumberField id="pit-loss" value={state.assumptions.pitLossSec} {...fieldLimits(LIMITS.pitLossSec)} onCommit={(v) => v != null && setAssumptions({ pitLossSec: v })} />
                <p className="text-xs text-muted-foreground">
                  {refDriver?.defaults.pitLossSource}.{" "}
                  {pitChanged && refDriver && (
                    <button className="underline underline-offset-2" onClick={() => setAssumptions({ pitLossSec: refDriver.defaults.pitLossSec })}>
                      Reset to {refDriver.defaults.pitLossSec}
                    </button>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="gap-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2">
                Tyre model <Badge variant="hypo">Hypothetical</Badge>
              </CardTitle>
              <CardDescription>Not derived from the dataset. Lap = base + offset + wear × age + cliff × laps past the cliff.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-[1.5rem_repeat(4,minmax(0,1fr))] gap-1.5 text-[10px] uppercase leading-tight tracking-wider text-muted-foreground">
                <span />
                <span title="Pace offset vs base, seconds per lap">Offset s</span>
                <span title="Degradation, seconds added per lap of tyre age">Wear s/lap</span>
                <span title="Tyre age (laps) where the cliff starts; empty = no cliff">Cliff at</span>
                <span title="Extra seconds per lap beyond the cliff">Cliff s/lap</span>
              </div>
              {compoundsShown.map((c) => {
                const m = state.assumptions.compounds[c];
                const label = COMPOUND_META[c].label;
                return (
                  <div key={c} className="grid grid-cols-[1.5rem_repeat(4,minmax(0,1fr))] items-center gap-1.5">
                    <CompoundDot compound={c} />
                    <NumberField className="h-8 px-2 text-xs" aria-label={`${label} pace offset`} value={m.paceOffsetSec} {...fieldLimits(LIMITS.paceOffsetSec)} onCommit={(v) => v != null && setCompound(c, { paceOffsetSec: v })} />
                    <NumberField className="h-8 px-2 text-xs" aria-label={`${label} wear per lap`} value={m.degSecPerLap} {...fieldLimits(LIMITS.degSecPerLap)} onCommit={(v) => v != null && setCompound(c, { degSecPerLap: v })} />
                    <NumberField
                      className="h-8 px-2 text-xs"
                      aria-label={`${label} cliff starts at tyre age`}
                      value={m.cliffAfterLaps}
                      {...fieldLimits(LIMITS.cliffAfterLaps)}
                      nullable
                      placeholder="none"
                      onCommit={(v) => setCompound(c, { cliffAfterLaps: v })}
                    />
                    <NumberField className="h-8 px-2 text-xs" aria-label={`${label} extra wear past cliff`} value={m.cliffSecPerLap} {...fieldLimits(LIMITS.cliffSecPerLap)} onCommit={(v) => v != null && setCompound(c, { cliffSecPerLap: v })} />
                  </div>
                );
              })}
              <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-muted-foreground">
                <input type="checkbox" className="size-3.5 accent-[var(--signal)]" checked={showWet} onChange={(e) => setShowWet(e.target.checked)} />
                Show intermediate &amp; wet compounds
              </label>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="signal" onClick={share} disabled={encoded === null}>
              {copied ? <Check /> : <Link2 />} {copied ? "Link copied" : "Copy share link"}
            </Button>
            <Button variant="outline" onClick={() => setState(defaults)} disabled={isDefault}>
              <RotateCcw /> Reset
            </Button>
          </div>
          {encoded === null && (
            <p role="alert" className="text-xs text-destructive">
              Some inputs are outside the allowed ranges, so this setup can’t be turned into a share link.
            </p>
          )}
          {manualLink && (
            <div className="space-y-1.5">
              <Label htmlFor="manual-link">Copying isn’t available here. Copy this link manually:</Label>
              <input
                id="manual-link"
                readOnly
                value={manualLink}
                onFocus={(e) => e.currentTarget.select()}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 font-mono text-xs"
              />
            </div>
          )}
        </aside>

        <div className="min-w-0 space-y-6">
          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-display text-2xl font-bold uppercase tracking-wide">Strategies</h2>
                <p className="text-sm text-muted-foreground">Edit stint lengths or stop laps. The race distance is {totalLaps} laps.</p>
              </div>
              <Button variant="outline" size="sm" onClick={addStrategy} disabled={state.strategies.length >= MAX_STRATEGIES}>
                <Plus /> Add strategy ({state.strategies.length}/{MAX_STRATEGIES})
              </Button>
            </div>
            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {state.strategies.map((s) => (
                <StrategyEditor
                  key={s.id}
                  strategy={s}
                  result={results.find((r) => r.strategyId === s.id)}
                  totalLaps={totalLaps}
                  drivers={drivers}
                  showWet={showWet}
                  canRemove={state.strategies.length > 1}
                  onChange={setStrategy}
                  onRemove={() => removeStrategy(s.id)}
                />
              ))}
            </div>
          </div>

          <ResultsPanel strategies={state.strategies} results={results} report={report} refDriver={refDriver} totalLaps={totalLaps} />
          <p className="text-xs text-muted-foreground">
            Experiment <code data-testid="experiment-id">{experiment.id}</code> · model <code>v{experiment.spec.modelVersion}</code> · race{" "}
            <code>{raceId}</code> · dataset <code data-testid="dataset-version">{datasetVersion}</code>. Identical inputs always give the same id and
            the same results; everything is computed deterministically in your browser and nothing is sent to a server.
          </p>
        </div>
      </div>
    </div>
  );
}

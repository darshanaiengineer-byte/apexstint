"use client";

import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ComparisonReport } from "@/lib/sim/compare";
import type { SimResult, Strategy } from "@/lib/sim/model";
import { fmtClock, fmtGap, fmtLapMs } from "@/lib/format";
import { AXIS_TICK, GRID_STROKE, SERIES_DASH, SERIES_SLOTS } from "@/components/charts/series";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout, StatePanel } from "@/components/site/states";
import { cn } from "@/lib/utils";
import { strategySlot, type LabDriver } from "./types";

function Swatch({ id }: { id: string }) {
  const slot = strategySlot(id);
  return (
    <svg width="18" height="6" aria-hidden className="shrink-0">
      <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES_SLOTS[slot]} strokeWidth="3" strokeDasharray={SERIES_DASH[slot]} />
    </svg>
  );
}

const fmtComp = (s: number) => `${s >= 0 ? "+" : "−"}${Math.abs(s).toFixed(1)}`;

export function ResultsPanel({
  strategies,
  results,
  report,
  refDriver,
  totalLaps,
}: {
  strategies: Strategy[];
  results: SimResult[];
  report: ComparisonReport;
  refDriver: LabDriver | undefined;
  totalLaps: number;
}) {
  const byId = useMemo(() => new Map(strategies.map((s) => [s.id, s])), [strategies]);
  const resultById = useMemo(() => new Map(results.map((r) => [r.strategyId, r])), [results]);
  const valid = useMemo(() => results.filter((r) => r.ok), [results]);
  const fastest = report.fastestId ? resultById.get(report.fastestId) : undefined;

  const gapData = useMemo(() => {
    if (!fastest) return [];
    return fastest.laps.map((fl, i) => {
      const row: Record<string, number> = { lap: fl.lap };
      for (const r of valid) row[r.strategyId] = Math.round((r.laps[i].cumulativeSec - fl.cumulativeSec) * 1000) / 1000;
      return row;
    });
  }, [fastest, valid]);

  const lapData = useMemo(() => {
    const rec = new Map(refDriver?.cleanLaps.map((l) => [l.lap, l.sec]));
    return Array.from({ length: totalLaps }, (_, i) => {
      const row: Record<string, number | null> = { lap: i + 1, recorded: rec.get(i + 1) ?? null };
      for (const r of valid) row[r.strategyId] = r.laps[i]?.lapSec ?? null;
      return row;
    });
  }, [valid, refDriver, totalLaps]);

  if (valid.length === 0) {
    return (
      <StatePanel kind="error" title="Nothing to compare yet">
        Fix the issues listed on each strategy (usually the stints must add up to {totalLaps} laps) and the results will appear here.
      </StatePanel>
    );
  }

  // Match on the actual stints, not the (user-editable) name, so only a genuine as-raced strategy is compared.
  const recordedKey = refDriver?.recorded.ok ? JSON.stringify(refDriver.recorded.stints) : null;
  const asRaced = recordedKey ? strategies.find((s) => JSON.stringify(s.stints) === recordedKey) : undefined;
  const asRacedResult = asRaced ? resultById.get(asRaced.id) : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Estimated race time</CardTitle>
            <CardDescription>Modelled totals under your assumptions, fastest first. Components sum exactly to the total.</CardDescription>
          </div>
          <Badge variant="hypo">Hypothetical</Badge>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Strategy</th>
                <th className="py-2 pr-3 text-right font-medium">Total</th>
                <th className="py-2 pr-3 text-right font-medium">Gap</th>
                <th className="py-2 pr-3 text-right font-medium" title="Laps × base lap">
                  Base
                </th>
                <th className="py-2 pr-3 text-right font-medium" title="Σ compound pace offsets">
                  Compound
                </th>
                <th className="py-2 pr-3 text-right font-medium" title="Σ linear degradation">
                  Wear
                </th>
                <th className="py-2 pr-3 text-right font-medium" title="Σ extra loss past the cliff">
                  Cliff
                </th>
                <th className="py-2 text-right font-medium" title="Charged stops × pit loss">
                  Pit loss
                </th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => {
                const r = resultById.get(row.strategyId)!;
                const c = r.components!;
                return (
                  <tr key={row.strategyId} className={cn("border-b border-border/60 last:border-0", row.rank === 1 && "bg-signal/5")}>
                    <td className="py-2.5 pr-3 font-mono tabular">{row.rank}</td>
                    <td className="py-2.5 pr-3">
                      <span className="flex items-center gap-2 font-semibold">
                        <Swatch id={row.strategyId} />
                        {row.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {r.stopLaps.length} stop{r.stopLaps.length === 1 ? "" : "s"}
                        {r.stopLaps.length > 0 && ` · lap ${r.stopLaps.join(", ")}`}
                        {r.chargedStops !== r.stopLaps.length && ` · ${r.stopLaps.length - r.chargedStops} free`}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono font-semibold tabular">{fmtClock(row.totalSec)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono tabular">{row.rank === 1 ? "—" : fmtGap(row.gapSec)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs tabular text-muted-foreground">{fmtClock(c.baseSec, 1)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs tabular">{fmtComp(c.compoundSec)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs tabular">{fmtComp(c.degradationSec)}</td>
                    <td className="py-2.5 pr-3 text-right font-mono text-xs tabular">{fmtComp(c.cliffSec)}</td>
                    <td className="py-2.5 text-right font-mono text-xs tabular">{fmtComp(c.pitSec)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Component columns in seconds. Base pace is identical for equal race distance, so it never explains a gap.</p>
        </CardContent>
      </Card>

      {report.rows.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Why the totals differ</CardTitle>
            <CardDescription>Each gap is the exact sum of the component differences against the fastest strategy.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {report.summary.length > 0 && (
              <ul className="space-y-1 text-sm">
                {report.summary.map((s) => (
                  <li key={s} className="flex gap-2">
                    <span className="text-signal" aria-hidden>
                      ▸
                    </span>
                    {s}
                  </li>
                ))}
              </ul>
            )}
            <div className="grid gap-4 md:grid-cols-2">
              {report.rows.slice(1).map((row) => {
                const max = Math.max(1, ...row.deltas.map((d) => Math.abs(d.deltaSec)));
                return (
                  <div key={row.strategyId} className="rounded-lg border p-4">
                    <p className="mb-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
                      <Swatch id={row.strategyId} /> {row.name}
                      <span className="font-mono font-normal tabular text-muted-foreground">
                        {fmtGap(row.gapSec)} vs {report.rows[0].name}
                      </span>
                    </p>
                    <ul className="space-y-1.5" aria-label={`Component differences for ${row.name}`}>
                      {row.deltas
                        .filter((d) => d.key !== "baseSec")
                        .map((d) => {
                          const w = (Math.abs(d.deltaSec) / max) * 50;
                          return (
                            <li key={d.key} className="grid grid-cols-[7.5rem_1fr_4rem] items-center gap-2 text-xs">
                              <span className="text-muted-foreground">{d.label}</span>
                              <span className="relative h-3 rounded-sm bg-muted" aria-hidden>
                                <span className="absolute inset-y-0 left-1/2 w-px bg-border" />
                                <span
                                  className={cn("absolute inset-y-0 rounded-[3px]", d.deltaSec >= 0 ? "bg-destructive/70" : "bg-signal/80")}
                                  style={d.deltaSec >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }}
                                />
                              </span>
                              <span className="text-right font-mono tabular">{fmtComp(d.deltaSec)} s</span>
                            </li>
                          );
                        })}
                    </ul>
                    <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                      {row.explanation.map((e) => (
                        <li key={e}>• {e}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Bars right of centre cost time versus the fastest strategy; bars left of centre gain time.</p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Gap to fastest, lap by lap</CardTitle>
          <CardDescription>Cumulative modelled time behind {report.rows[0]?.name}. Steps up are pit stops; slopes are pace and wear.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]" role="img" aria-label="Cumulative gap to the fastest strategy by lap">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={gapData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="lap" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={18} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={48} tickFormatter={(v: number) => `${v > 0 ? "+" : ""}${v.toFixed(0)}s`} />
                <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeDasharray="2 2" />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={({ active, label }) => {
                    if (!active || label == null) return null;
                    const row = gapData[Number(label) - 1];
                    if (!row) return null;
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
                        <p className="mb-1 font-mono font-semibold">After lap {String(label)}</p>
                        {valid.map((r) => (
                          <p key={r.strategyId} className="flex items-center gap-2">
                            <Swatch id={r.strategyId} />
                            <span className="min-w-24">{byId.get(r.strategyId)?.name}</span>
                            <span className="font-mono tabular">{fmtGap(row[r.strategyId], 1)}</span>
                          </p>
                        ))}
                      </div>
                    );
                  }}
                />
                {valid.map((r) => {
                  const slot = strategySlot(r.strategyId);
                  return (
                    <Line
                      key={r.strategyId}
                      dataKey={r.strategyId}
                      name={byId.get(r.strategyId)?.name}
                      type="linear"
                      stroke={SERIES_SLOTS[slot]}
                      strokeDasharray={SERIES_DASH[slot]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <CardTitle>Modelled lap times</CardTitle>
            <CardDescription>
              Lines are the model.{refDriver ? ` Grey dots are ${refDriver.code}’s recorded representative laps, for reference only.` : ""}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Badge variant="hypo">Model</Badge>
            {refDriver && <Badge variant="recorded">Recorded dots</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]" role="img" aria-label="Modelled lap time per strategy with recorded reference laps">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lapData} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
                <CartesianGrid stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="lap" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} minTickGap={18} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={58} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtClock(v, 1)} />
                <Tooltip
                  cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                  content={({ active, label }) => {
                    if (!active || label == null) return null;
                    const row = lapData[Number(label) - 1];
                    if (!row) return null;
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
                        <p className="mb-1 font-mono font-semibold">Lap {String(label)}</p>
                        {valid.map((r) => {
                          const l = r.laps[Number(label) - 1];
                          return (
                            <p key={r.strategyId} className="flex items-center gap-2">
                              <Swatch id={r.strategyId} />
                              <span className="min-w-24">{byId.get(r.strategyId)?.name}</span>
                              <span className="font-mono tabular">{fmtClock(l?.lapSec)}</span>
                              <span className="text-muted-foreground">
                                {l?.compound.charAt(0)} · age {l?.tyreAge}
                                {l?.pitSec ? " · +pit" : ""}
                              </span>
                            </p>
                          );
                        })}
                        {refDriver && (
                          <p className="mt-1 flex items-center gap-2 border-t pt-1">
                            <span className="inline-block size-2 rounded-full bg-muted-foreground" aria-hidden />
                            <span className="min-w-24">{refDriver.code} recorded</span>
                            <span className="font-mono tabular">{row.recorded != null ? fmtClock(row.recorded) : "excluded"}</span>
                          </p>
                        )}
                      </div>
                    );
                  }}
                />
                {refDriver && (
                  <Line
                    dataKey="recorded"
                    stroke="transparent"
                    dot={{ r: 2.5, fill: "var(--muted-foreground)", stroke: "none" }}
                    activeDot={false}
                    isAnimationActive={false}
                    connectNulls={false}
                  />
                )}
                {valid.map((r) => {
                  const slot = strategySlot(r.strategyId);
                  return (
                    <Line
                      key={r.strategyId}
                      dataKey={r.strategyId}
                      type="linear"
                      stroke={SERIES_SLOTS[slot]}
                      strokeDasharray={SERIES_DASH[slot]}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                      isAnimationActive={false}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Pit loss is added to the total but not drawn on the lap line, so in-laps don’t distort the scale.</p>
        </CardContent>
      </Card>

      {refDriver && refDriver.recordedRaceMs != null && (
        <Callout tone="recorded" title={`Recorded reference: ${refDriver.name}`}>
          Official race time <strong className="font-mono tabular">{fmtLapMs(refDriver.recordedRaceMs)}</strong>
          {asRacedResult?.ok && asRacedResult.totalSec != null && (
            <>
              {" "}
              versus <strong className="font-mono tabular">{fmtClock(asRacedResult.totalSec)}</strong> modelled for “{asRaced?.name}” (
              {fmtGap(asRacedResult.totalSec - refDriver.recordedRaceMs / 1000, 1)}).
            </>
          )}{" "}
          The official time includes everything that happened in the race; the model leaves out the standing start, red-flag stoppages, Safety Car and VSC periods, traffic, fuel burn and real tyre behaviour, so it is not expected to
          reproduce the recorded time. Use it to compare strategies against each other under the same assumptions.
        </Callout>
      )}
    </div>
  );
}

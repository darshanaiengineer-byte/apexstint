import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { classifyLaps, driverMap, driverPitStops, driverTimeline, driversByFinish, isLongPit, isStoppagePit, medianPitLaneMs } from "@/lib/data/derive";
import type { LapRecord, Race } from "@/lib/data/schema";
import { fmtLapMs, fmtSec } from "@/lib/format";
import { RaceHeader } from "@/components/race/race-header";
import { StintTimeline, type TimelineRow } from "@/components/race/stint-timeline";
import { LapChart, type LapChartDriver } from "@/components/race/lap-chart";
import { CompoundDot } from "@/components/compound";
import { Callout, StatePanel } from "@/components/site/states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadRace, raceStaticParams } from "./load";

export const generateStaticParams = raceStaticParams;

export async function generateMetadata({ params }: PageProps<"/races/[id]">): Promise<Metadata> {
  const { id } = await params;
  const res = await loadRace(id);
  return { title: res.ok ? `${res.race.raceName} ${res.race.season}` : "Race unavailable" };
}

export default async function RaceOverviewPage({ params }: PageProps<"/races/[id]">) {
  const { id } = await params;
  const res = await loadRace(id);
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StatePanel kind="error" title="This race file failed validation" action={{ href: "/data", label: "See data status" }}>
          <ul className="mt-2 space-y-1 text-left font-mono text-xs">{"issues" in res && res.issues.map((i) => <li key={i}>{i}</li>)}</ul>
        </StatePanel>
      </div>
    );
  }
  return <Overview race={res.race} />;
}

function Overview({ race }: { race: Race }) {
  const drivers = driverMap(race);
  const ordered = driversByFinish(race);
  const results = [...race.results].sort((a, b) => a.position - b.position);
  const winner = results[0];
  const winnerDriver = winner ? drivers.get(winner.driverId) : undefined;
  const winnerTime = winner?.timeMs ?? null;

  let fastest: LapRecord | null = null;
  for (const l of race.laps) if (l.timeMs != null && (fastest == null || l.timeMs < (fastest.timeMs as number))) fastest = l;
  const medPit = medianPitLaneMs(race);
  const totalStops = race.pitStops.filter((p) => !isStoppagePit(p)).length;

  const timelineRows: TimelineRow[] = ordered.map((d) => {
    const r = race.results.find((x) => x.driverId === d.driverId);
    return {
      driverId: d.driverId,
      code: d.code,
      name: `${d.givenName} ${d.familyName}`,
      team: d.team,
      positionText: r?.positionText ?? "–",
      lapsDone: r?.laps ?? null,
      segments: driverTimeline(race, d.driverId),
      pitStops: driverPitStops(race, d.driverId).map((p) => ({ lap: p.lap, durationMs: p.durationMs, stoppage: isStoppagePit(p), long: isLongPit(p) })),
    };
  });

  const lapDrivers: LapChartDriver[] = ordered
    .map((d) => ({
      driverId: d.driverId,
      code: d.code,
      name: `${d.givenName} ${d.familyName}`,
      laps: classifyLaps(race, d.driverId).map((l) => ({ lap: l.lap, timeMs: l.timeMs, exclusions: l.exclusions })),
    }))
    .filter((d) => d.laps.length > 0);

  const stats = [
    { label: "Winner", value: winnerDriver ? `${winnerDriver.givenName} ${winnerDriver.familyName}` : "—", sub: winnerDriver?.team },
    { label: "Winning race time", value: fmtLapMs(winnerTime), sub: "Official classification" },
    { label: "Fastest recorded lap", value: fmtLapMs(fastest?.timeMs), sub: fastest ? `${drivers.get(fastest.driverId)?.code} · lap ${fastest.lap}` : undefined },
    { label: "Pit stops", value: String(totalStops), sub: medPit != null ? `median pit-lane time ${fmtSec(medPit / 1000)}` : "no durations recorded" },
  ];

  return (
    <>
      <RaceHeader race={race} active="overview" />
      <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6">
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-0 rounded-xl border bg-card p-4">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">{s.label}</dt>
              <dd className="mt-1 truncate font-display text-2xl font-bold tracking-wide tabular sm:text-3xl">{s.value}</dd>
              {s.sub && <dd className="truncate text-xs text-muted-foreground">{s.sub}</dd>}
            </div>
          ))}
        </dl>

        {race.notes.map((n) => (
          <Callout key={n} tone="warn" title="Race note">
            {n}
          </Callout>
        ))}

        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
            <div className="space-y-1.5">
              <CardTitle>Tyre stints</CardTitle>
              <CardDescription>Recorded compound and stint length for every car, in finishing order.</CardDescription>
            </div>
            <Button asChild variant="signal" size="sm">
              <Link href={`/races/${race.id}/strategy`}>
                Test alternatives <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {timelineRows.some((r) => r.segments.length) ? (
              <StintTimeline rows={timelineRows} totalLaps={race.scheduledLaps} />
            ) : (
              <StatePanel title="No stint data">This race file has no tyre stints or pit stops.</StatePanel>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lap times</CardTitle>
            <CardDescription>Recorded lap-by-lap times. Pick up to four drivers.</CardDescription>
          </CardHeader>
          <CardContent>
            {lapDrivers.length ? (
              <LapChart drivers={lapDrivers} totalLaps={race.scheduledLaps} initial={lapDrivers.slice(0, 3).map((d) => d.driverId)} />
            ) : (
              <StatePanel title="No lap times">This race file contains no lap timing rows.</StatePanel>
            )}
          </CardContent>
        </Card>

        <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Classification</CardTitle>
              <CardDescription>Finishing positions as recorded. Empty cells mean the source has no value.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-2 font-medium">Pos</th>
                    <th className="py-2 pr-2 font-medium">Driver</th>
                    <th className="py-2 pr-2 font-medium">Grid</th>
                    <th className="py-2 pr-2 font-medium">Laps</th>
                    <th className="py-2 pr-2 font-medium">Stops</th>
                    <th className="py-2 pr-2 font-medium">Tyres</th>
                    <th className="py-2 text-right font-medium">Time / status</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r) => {
                    const d = drivers.get(r.driverId);
                    const segs = driverTimeline(race, r.driverId);
                    const stops = driverPitStops(race, r.driverId).filter((p) => !isStoppagePit(p)).length;
                    const gap = r.timeMs != null && winnerTime != null && r.position !== 1 ? `+${((r.timeMs - winnerTime) / 1000).toFixed(3)}s` : null;
                    return (
                      <tr key={r.driverId} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pr-2 font-mono tabular">{r.positionText}</td>
                        <td className="py-2 pr-2">
                          <span className="font-semibold">{d?.code}</span> <span className="text-muted-foreground">{d?.familyName}</span>
                          <span className="block text-xs text-muted-foreground">{d?.team}</span>
                        </td>
                        <td className="py-2 pr-2 font-mono tabular">{r.grid ?? ""}</td>
                        <td className="py-2 pr-2 font-mono tabular">{r.laps}</td>
                        <td className="py-2 pr-2 font-mono tabular">{stops}</td>
                        <td className="py-2 pr-2">
                          <span className="flex gap-0.5">
                            {segs.map((s) => (
                              <CompoundDot key={s.stint} compound={s.compound} className="size-4 text-[9px]" />
                            ))}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono text-xs tabular">
                          {r.position === 1 ? fmtLapMs(r.timeMs) : (gap ?? <span className="text-muted-foreground">{r.status}</span>)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>

          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Pit stops</CardTitle>
              <CardDescription>Pit-lane time is entry-to-exit as published by timing, not stationary time.</CardDescription>
            </CardHeader>
            <CardContent className="max-h-[640px] overflow-y-auto">
              {race.pitStops.length === 0 ? (
                <StatePanel title="No pit stops recorded" />
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-2 font-medium">Lap</th>
                      <th className="py-2 pr-2 font-medium">Driver</th>
                      <th className="py-2 pr-2 font-medium">Stop</th>
                      <th className="py-2 text-right font-medium">Pit lane</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...race.pitStops]
                      .sort((a, b) => a.lap - b.lap || (a.durationMs ?? 0) - (b.durationMs ?? 0))
                      .map((p) => (
                        <tr key={`${p.driverId}-${p.stop}`} className="border-b border-border/60 last:border-0">
                          <td className="py-1.5 pr-2 font-mono tabular">{p.lap}</td>
                          <td className="py-1.5 pr-2 font-semibold">{drivers.get(p.driverId)?.code}</td>
                          <td className="py-1.5 pr-2 font-mono tabular text-muted-foreground">#{p.stop}</td>
                          <td className="py-1.5 text-right font-mono tabular">
                            {isStoppagePit(p) ? (
                              <span className="text-destructive">{fmtLapMs(p.durationMs)} · red-flag stoppage</span>
                            ) : isLongPit(p) ? (
                              <span className="text-amber-700 dark:text-amber-400">{fmtLapMs(p.durationMs)} · long stop</span>
                            ) : (
                              fmtLapMs(p.durationMs)
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

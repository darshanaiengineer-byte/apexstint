import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { LOCAL_RACE_IDS, raceRepository } from "@/lib/data/repository";
import { coverage } from "@/lib/data/derive";
import { consistencyWarnings } from "@/lib/data/schema";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/site/states";

export const metadata: Metadata = { title: "Data sources & coverage" };

const pct = (a: number, b: number) => (b === 0 ? "—" : `${Math.round((a / b) * 100)}%`);

export default async function DataPage() {
  const loaded = await Promise.all(LOCAL_RACE_IDS.map(async (id) => ({ id, res: await raceRepository.getRace(id) })));
  const races = loaded.flatMap(({ res }) => (res.ok ? [res.race] : []));
  const failed = loaded.filter(({ res }) => !res.ok);
  const seasons = [...new Set(races.map((r) => r.season))].sort();
  const sources = new Map(races.flatMap((r) => r.sources).map((s) => [s.name, s]));

  return (
    <div className="mx-auto max-w-7xl space-y-10 px-4 py-12 sm:px-6">
      <header className="max-w-3xl space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Data</p>
        <h1 className="font-display text-5xl font-bold uppercase tracking-tight">Sources, coverage &amp; limits</h1>
        <p className="text-lg text-muted-foreground">
          ApexStint ships a small, validated snapshot of {races.length} races from the {seasons.join(", ")} season. Every number labelled “recorded” comes
          from the sources below; nothing is interpolated or invented. Values the sources don’t provide are shown as missing.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2" aria-label="Sources">
        {[...sources.values()].map((s) => (
          <Card key={s.name}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {s.name} <Badge variant="outline">{s.license}</Badge>
              </CardTitle>
              <CardDescription>
                <a href={s.url} className="underline underline-offset-2">
                  {s.url}
                </a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                Provides: <span className="font-medium">{s.fields.join(", ")}</span>
              </p>
              <p className="text-muted-foreground">Retrieved {new Date(s.retrievedAt).toUTCString()}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Callout title="Licence & attribution">
        Both sources publish their data under{" "}
        <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" className="underline underline-offset-2">
          Creative Commons BY-NC-SA 4.0
        </a>

        , for non-commercial use only; both ask commercial users to contact them. OpenF1 also states that it does not claim ownership of the
        underlying Formula 1 data. The bundled files in <code>data/</code> are an adaptation (field names normalised, times converted to
        milliseconds) shared under the same licence. ApexStint is not cleared for commercial use; see <code>data/LICENSE.md</code>. It is an
        unofficial fan project, not associated with Formula 1 or any team.
      </Callout>

      <section aria-labelledby="coverage-h" className="space-y-4">
        <h2 id="coverage-h" className="font-display text-3xl font-bold uppercase tracking-wide">
          Coverage by race
        </h2>
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3 font-medium">Race</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Drivers</th>
                <th className="px-4 py-3 text-right font-medium">Lap rows (timed)</th>
                <th className="px-4 py-3 text-right font-medium">Pit visits (long / red flag)</th>
                <th className="px-4 py-3 text-right font-medium">Stints (compound known)</th>
                <th className="px-4 py-3 text-right font-medium">Drivers with stints</th>
              </tr>
            </thead>
            <tbody>
              {races.map((r) => {
                const c = coverage(r);
                const warnings = consistencyWarnings(r);
                return (
                  <tr key={r.id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/races/${r.id}`} className="font-semibold hover:underline">
                        {r.season} {r.raceName}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        Round {r.round} · {fmtDate(r.date)} · {r.scheduledLaps} laps
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-center gap-1.5 text-xs">
                        <CheckCircle2 className="size-4 text-signal" aria-hidden /> Valid{warnings.length ? `, ${warnings.length} warnings` : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">{r.kind === "historical" ? "Recorded" : "Demonstration"}</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular">{c.drivers}</td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {c.lapRows} <span className="text-muted-foreground">({pct(c.lapRowsWithTime, c.lapRows)})</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {c.pitStops} <span className="text-muted-foreground">({c.longPitStops} / {c.stoppagePitStops})</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {c.stints} <span className="text-muted-foreground">({pct(c.stintsWithCompound, c.stints)})</span>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular">
                      {c.driversWithStints}/{c.drivers}
                    </td>
                  </tr>
                );
              })}
              {failed.map(({ id, res }) => (
                <tr key={id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3 font-mono">{id}</td>
                  <td className="px-4 py-3" colSpan={6}>
                    <span className="flex items-center gap-1.5 text-xs text-destructive">
                      <XCircle className="size-4" aria-hidden /> Failed validation{!res.ok && res.reason === "invalid" ? `: ${res.issues[0]}` : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">
          Long stops are real stops over 60 s (e.g. a slow wheel change); red-flag stoppages are pit-lane visits over 10 minutes during a suspension. Every file is validated against a schema at load time and by{" "}
          <code>npm run data:validate</code>; stint boundaries are cross-checked against pit-stop laps from the other source.
        </p>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Missing fields</CardTitle>
            <CardDescription>Listed per race file, as written by the dataset builder.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {races.map((r) => (
              <div key={r.id}>
                <p className="font-semibold">
                  {r.season} {r.raceName}
                </p>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted-foreground">
                  {r.missingFields.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                  {r.notes.map((n) => (
                    <li key={n} className="text-amber-700 dark:text-amber-400">
                      {n}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Limitations</CardTitle>
            <CardDescription>What this dataset and app can’t tell you.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Three races only: a deliberately small, documented sample, not a season archive.</li>
              <li>No telemetry, sector times, weather, track temperature or Safety Car / VSC windows. Neutralised laps are detected only as unusually slow laps.</li>
              <li>Pit-lane time is entry-to-exit as published by timing. True pit loss also depends on the racing-line time it replaces, so it’s only a proxy.</li>
              <li>Tyre stints come from a different source than lap times. They agree with pit-stop laps for every bundled race, but this is checked, not guaranteed.</li>
              <li>Tyre performance (pace offsets, degradation, cliffs) isn’t in the data at all. The simulator’s tyre values are hypothetical inputs.</li>
              <li>Lap times for lapped or retired drivers stop when they stop. Nothing is extrapolated.</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <Callout title="Adding a race or another source">
        Add an entry to <code>scripts/fetch-data.mjs</code>, run <code>npm run data:fetch</code> and <code>npm run data:validate</code>, then register the
        file in <code>src/lib/data/repository.ts</code>. Any other permitted source only needs to implement the <code>RaceRepository</code> interface.
      </Callout>
    </div>
  );
}

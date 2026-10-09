import Link from "next/link";
import { ArrowRight, Database, FlaskConical, LineChart } from "lucide-react";
import { raceRepository } from "@/lib/data/repository";
import { driverTimeline } from "@/lib/data/derive";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StintStrip } from "@/components/race/stint-strip";
import { StatePanel } from "@/components/site/states";

export default async function HomePage() {
  const races = await raceRepository.listRaces();
  const cards = await Promise.all(
    races.map(async (summary) => {
      const res = await raceRepository.getRace(summary.id);
      const race = res.ok ? res.race : null;
      const winnerId = race?.results.find((r) => r.position === 1)?.driverId;
      return { summary, winnerTimeline: race && winnerId ? driverTimeline(race, winnerId) : [] };
    }),
  );
  const featured = races[0];

  return (
    <>
      <section className="carbon border-b">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.25fr_1fr] lg:items-end">
          <div className="space-y-6">
            <Badge variant="recorded" className="uppercase tracking-wider">
              {races.length} recorded races · 2024 season
            </Badge>
            <h1 className="font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight text-balance sm:text-6xl lg:text-7xl">
              Read the race.
              <br />
              <span className="text-signal">Rewrite the strategy.</span>
            </h1>
            <p className="max-w-xl text-lg text-muted-foreground text-pretty">
              ApexStint lays out recorded lap times, pit stops and tyre stints, then lets you test alternative pit strategies with a transparent model
              whose every assumption is on screen.
            </p>
            {featured && (
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="signal" size="lg">
                  <Link href={`/races/${featured.id}/strategy`}>
                    Open the strategy lab <ArrowRight />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="/methodology">How the model works</Link>
                </Button>
              </div>
            )}
          </div>
          <ul className="grid gap-3 text-sm">
            {[
              { icon: Database, title: "Recorded", body: "Lap times, pit stops, results and tyre stints from open, attributed sources. Missing values stay missing." },
              { icon: FlaskConical, title: "Hypothetical", body: "Pit loss, compound pace and degradation are your inputs, clearly labelled and shareable via URL." },
              { icon: LineChart, title: "Explained", body: "Totals break down into base pace, compound offset, wear and pit loss, so every gap has a reason." },
            ].map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex gap-4 rounded-xl border bg-card/70 p-4 backdrop-blur">
                <Icon className="mt-0.5 size-5 shrink-0 text-signal" aria-hidden />
                <div>
                  <p className="font-display text-lg font-semibold uppercase tracking-wide">{title}</p>
                  <p className="text-muted-foreground">{body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-labelledby="races-heading">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="races-heading" className="font-display text-3xl font-bold uppercase tracking-wide">
              Choose a race
            </h2>
            <p className="text-sm text-muted-foreground">Each strip shows the winner’s recorded tyre sequence.</p>
          </div>
          <Link href="/data" className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
            What’s in the dataset →
          </Link>
        </div>

        {cards.length === 0 ? (
          <StatePanel kind="error" title="No races available" action={{ href: "/data", label: "Check the data page" }}>
            None of the bundled race files passed validation. Run <code>npm run data:validate</code> for details.
          </StatePanel>
        ) : (
          <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {cards.map(({ summary: r, winnerTimeline }) => (
              <li key={r.id}>
                <article className="group relative flex h-full flex-col gap-5 rounded-xl border bg-card p-5 transition-colors hover:border-foreground/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
                        {r.season} · Round {String(r.round).padStart(2, "0")}
                      </p>
                      <h3 className="mt-1 font-display text-2xl font-bold uppercase leading-tight tracking-wide">
                        <Link href={`/races/${r.id}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                          {r.raceName}
                        </Link>
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        {r.circuitName} · {fmtDate(r.date)}
                      </p>
                    </div>
                    <span className="shrink-0 whitespace-nowrap rounded-md border px-2 py-1 font-mono text-xs tabular text-muted-foreground">{r.scheduledLaps} laps</span>
                  </div>
                  <div className="mt-auto space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span>Winner</span>
                      <span className="font-medium text-foreground">{r.winner ?? "—"}</span>
                    </div>
                    {winnerTimeline.length > 0 ? (
                      <StintStrip segments={winnerTimeline} totalLaps={r.scheduledLaps} />
                    ) : (
                      <p className="text-xs text-muted-foreground">No stint data recorded.</p>
                    )}
                  </div>
                  <div className="relative z-10 flex gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link href={`/races/${r.id}`}>Overview</Link>
                    </Button>
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/races/${r.id}/strategy`}>Strategy lab</Link>
                    </Button>
                  </div>
                </article>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

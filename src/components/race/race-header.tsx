import Link from "next/link";
import type { Race } from "@/lib/data/schema";
import { fmtDate } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function RaceHeader({ race, active }: { race: Race; active: "overview" | "strategy" }) {
  const tabs = [
    { key: "overview", href: `/races/${race.id}`, label: "Race overview" },
    { key: "strategy", href: `/races/${race.id}/strategy`, label: "Strategy lab" },
  ] as const;
  return (
    <div className="carbon border-b">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
        <nav aria-label="Breadcrumb" className="mb-3 text-xs text-muted-foreground">
          <Link href="/" className="hover:text-foreground">
            Races
          </Link>{" "}
          / <span>{race.raceName}</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {race.season} · Round {String(race.round).padStart(2, "0")} · {fmtDate(race.date)}
            </p>
            <h1 className="mt-1 font-display text-4xl font-bold uppercase tracking-tight sm:text-5xl">{race.raceName}</h1>
            <p className="text-sm text-muted-foreground">
              {race.circuit.name}, {race.circuit.locality}, {race.circuit.country} · {race.scheduledLaps} laps
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {race.kind === "historical" ? <Badge variant="recorded">Recorded data</Badge> : <Badge variant="hypo">Demonstration data</Badge>}
            <Badge variant="outline">{race.sources.map((s) => s.name).join(" + ")}</Badge>
          </div>
        </div>
        <nav className="mt-6 flex gap-1" aria-label="Race sections">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? "page" : undefined}
              className={cn(
                "-mb-px border-b-2 px-3 pb-3 text-sm font-medium transition-colors",
                active === t.key ? "border-signal text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

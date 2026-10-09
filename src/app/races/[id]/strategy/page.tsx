import type { Metadata } from "next";
import Link from "next/link";
import { classifyLaps, driversByFinish } from "@/lib/data/derive";
import type { Race } from "@/lib/data/schema";
import { defaultAssumptions } from "@/lib/sim/model";
import { initialStrategies, recordedDefaults, recordedStrategy } from "@/lib/sim/recorded";
import { decodeLabState, type LabState } from "@/lib/share/url-state";
import { RaceHeader } from "@/components/race/race-header";
import { StrategyLab } from "@/components/strategy/strategy-lab";
import type { LabDriver } from "@/components/strategy/types";
import { Callout, StatePanel } from "@/components/site/states";
import { loadRace } from "../load";

export async function generateMetadata({ params }: PageProps<"/races/[id]/strategy">): Promise<Metadata> {
  const { id } = await params;
  const res = await loadRace(id);
  return { title: res.ok ? `Strategy lab · ${res.race.raceName} ${res.race.season}` : "Strategy lab" };
}

function labDrivers(race: Race): LabDriver[] {
  return driversByFinish(race).map((d) => {
    const r = race.results.find((x) => x.driverId === d.driverId);
    return {
      driverId: d.driverId,
      code: d.code,
      name: `${d.givenName} ${d.familyName}`,
      team: d.team,
      positionText: r?.positionText ?? "–",
      recordedRaceMs: r?.timeMs ?? null,
      defaults: recordedDefaults(race, d.driverId),
      recorded: recordedStrategy(race, d.driverId),
      cleanLaps: classifyLaps(race, d.driverId)
        .filter((l) => l.clean)
        .map((l) => ({ lap: l.lap, sec: (l.timeMs as number) / 1000 })),
    };
  });
}

export default async function StrategyPage({ params, searchParams }: PageProps<"/races/[id]/strategy">) {
  const { id } = await params;
  const sp = await searchParams;
  const res = await loadRace(id);
  if (!res.ok) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StatePanel kind="error" title="This race file failed validation" action={{ href: "/data", label: "See data status" }} />
      </div>
    );
  }
  const race = res.race;
  const drivers = labDrivers(race);
  if (drivers.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <StatePanel title="No drivers in this race file" action={{ href: "/", label: "Choose another race" }} />
      </div>
    );
  }

  // Default reference: the winner (or the first driver with a recorded strategy).
  const ref = drivers.find((d) => d.positionText === "1") ?? drivers.find((d) => d.recorded.ok) ?? drivers[0];
  const defaults: LabState = {
    driverId: ref.driverId,
    assumptions: defaultAssumptions(ref.defaults.baseLapSec, ref.defaults.pitLossSec),
    strategies: initialStrategies(race, ref.driverId),
  };

  const raw = typeof sp.cfg === "string" ? sp.cfg : undefined;
  const decoded = raw ? decodeLabState(raw) : null;
  const shared = decoded != null && drivers.some((d) => d.driverId === decoded.driverId) ? decoded : null;
  const shareStatus = raw ? (shared ? "loaded" : "invalid") : "none";

  return (
    <>
      <RaceHeader race={race} active="strategy" />
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
        <Callout tone="hypo" title="This is a what-if calculator, not a replay">
          Totals are estimates from a simple, deterministic model using the race inputs and tyre model below. Values marked <strong>From data</strong> are derived
          from recorded laps and pit stops; the tyre model is entirely hypothetical. It does not reproduce any team’s race model.{" "}
          <Link href="/methodology" className="underline underline-offset-2">
            Read the formulas
          </Link>
          .
        </Callout>
        {race.notes.map((n) => (
          <Callout key={n} tone="warn" title="Race note">
            {n}
          </Callout>
        ))}
        <StrategyLab
          key={raw ?? "default"}
          raceId={race.id}
          totalLaps={race.scheduledLaps}
          drivers={drivers}
          defaults={defaults}
          initial={shared ?? defaults}
          shareStatus={shareStatus}
        />
      </div>
    </>
  );
}

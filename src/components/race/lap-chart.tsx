"use client";

import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import type { LapExclusion } from "@/lib/data/derive";
import { fmtClock } from "@/lib/format";
import { AXIS_TICK, GRID_STROKE, SERIES_DASH, SERIES_SLOTS, nextFreeSlot } from "@/components/charts/series";
import { NativeSelect } from "@/components/ui/native-select";
import { StatePanel } from "@/components/site/states";

export interface LapChartDriver {
  driverId: string;
  code: string;
  name: string;
  laps: { lap: number; timeMs: number | null; exclusions: LapExclusion[] }[];
}

const EXCLUSION_LABEL: Record<LapExclusion, string> = {
  "lap-1": "lap 1",
  "in-lap": "in-lap",
  "out-lap": "out-lap",
  slow: ">7% off median",
  "no-time": "no time",
};

type Row = { lap: number; values: Record<string, number | null>; exclusions: Record<string, LapExclusion[]> } & Record<string, unknown>;

export function LapChart({ drivers, totalLaps, initial }: { drivers: LapChartDriver[]; totalLaps: number; initial: string[] }) {
  const [selected, setSelected] = useState<{ driverId: string; slot: number }[]>(() =>
    initial.slice(0, SERIES_SLOTS.length).map((driverId, slot) => ({ driverId, slot })),
  );
  const [representative, setRepresentative] = useState(true);
  const byId = useMemo(() => new Map(drivers.map((d) => [d.driverId, d])), [drivers]);

  const data = useMemo(() => {
    const rows: Row[] = Array.from({ length: totalLaps }, (_, i) => ({ lap: i + 1, values: {}, exclusions: {} }));
    for (const { driverId } of selected) {
      byId.get(driverId)?.laps.forEach((l) => {
        const row = rows[l.lap - 1];
        if (!row) return;
        const keep = l.timeMs != null && (!representative || l.exclusions.length === 0);
        row.values[driverId] = keep ? (l.timeMs as number) / 1000 : null;
        row.exclusions[driverId] = l.exclusions;
        row[driverId] = row.values[driverId];
      });
    }
    return rows;
  }, [selected, byId, totalLaps, representative]);

  const add = (driverId: string) => {
    if (!driverId || selected.some((s) => s.driverId === driverId)) return;
    const slot = nextFreeSlot(selected.map((s) => s.slot));
    if (slot == null) return;
    setSelected([...selected, { driverId, slot }]);
  };
  const remove = (driverId: string) => setSelected(selected.filter((s) => s.driverId !== driverId));
  const full = selected.length >= SERIES_SLOTS.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {selected.map(({ driverId, slot }) => (
          <span key={driverId} className="inline-flex h-8 items-center gap-2 rounded-md border bg-card pl-2.5 pr-1 text-sm">
            <svg width="18" height="6" aria-hidden>
              <line x1="0" y1="3" x2="18" y2="3" stroke={SERIES_SLOTS[slot]} strokeWidth="2.5" strokeDasharray={SERIES_DASH[slot]} />
            </svg>
            <span className="font-semibold">{byId.get(driverId)?.code}</span>
            <button
              type="button"
              onClick={() => remove(driverId)}
              className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
              aria-label={`Remove ${byId.get(driverId)?.name}`}
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <NativeSelect aria-label="Add a driver to the chart" value="" disabled={full} onChange={(e) => add(e.target.value)} className="w-44">
          <option value="">{full ? "Max 4 drivers" : "+ Add driver"}</option>
          {drivers
            .filter((d) => !selected.some((s) => s.driverId === d.driverId))
            .map((d) => (
              <option key={d.driverId} value={d.driverId}>
                {d.code} — {d.name}
              </option>
            ))}
        </NativeSelect>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground sm:ml-auto">
          <input type="checkbox" className="size-4 accent-[var(--signal)]" checked={representative} onChange={(e) => setRepresentative(e.target.checked)} />
          Representative laps only
        </label>
      </div>

      {selected.length === 0 ? (
        <StatePanel title="No drivers selected">Add up to four drivers to compare their recorded lap times.</StatePanel>
      ) : (
        <div className="h-[340px] w-full" role="img" aria-label={`Recorded lap times for ${selected.map((s) => byId.get(s.driverId)?.code).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
              <CartesianGrid stroke={GRID_STROKE} vertical={false} />
              <XAxis dataKey="lap" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID_STROKE }} interval="preserveStartEnd" minTickGap={18} />
              <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={58} domain={["auto", "auto"]} tickFormatter={(v: number) => fmtClock(v, 1)} />
              <Tooltip
                cursor={{ stroke: "var(--muted-foreground)", strokeDasharray: "3 3" }}
                content={({ active, label }) => {
                  if (!active || label == null) return null;
                  const row = data[Number(label) - 1];
                  if (!row) return null;
                  return (
                    <div className="min-w-48 rounded-md border bg-popover px-3 py-2 text-xs shadow-lg">
                      <p className="mb-1.5 font-mono font-semibold">Lap {String(label)}</p>
                      <ul className="space-y-1">
                        {selected.map(({ driverId, slot }) => {
                          const v = row.values[driverId];
                          const ex = row.exclusions[driverId] ?? [];
                          return (
                            <li key={driverId} className="flex items-center gap-2">
                              <span className="inline-block h-0.5 w-3 rounded" style={{ background: SERIES_SLOTS[slot] }} aria-hidden />
                              <span className="w-9 font-semibold">{byId.get(driverId)?.code}</span>
                              <span className="font-mono tabular">{v != null ? fmtClock(v) : "—"}</span>
                              {ex.length > 0 && <span className="text-muted-foreground">({ex.map((e) => EXCLUSION_LABEL[e]).join(", ")})</span>}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                }}
              />
              {selected.map(({ driverId, slot }) => (
                <Line
                  key={driverId}
                  type="linear"
                  dataKey={driverId}
                  name={byId.get(driverId)?.code}
                  stroke={SERIES_SLOTS[slot]}
                  strokeWidth={2}
                  strokeDasharray={SERIES_DASH[slot]}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {representative
          ? "Hidden: lap 1, in/out laps and laps more than 7% slower than the driver’s median (Safety Car, VSC, red flag, incidents). Gaps in a line are those laps."
          : "Showing every recorded lap, including pit laps and neutralised laps."}
      </p>
    </div>
  );
}

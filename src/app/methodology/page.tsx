import type { Metadata } from "next";
import Link from "next/link";
import { DEFAULT_COMPOUNDS, DRY_COMPOUNDS } from "@/lib/sim/model";
import { LONG_PIT_MS, OUTLIER_FACTOR, STOPPAGE_PIT_MS } from "@/lib/data/derive";
import { COMPOUND_META, CompoundDot } from "@/components/compound";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Callout } from "@/components/site/states";

export const metadata: Metadata = { title: "Methodology" };

function Formula({ children }: { children: React.ReactNode }) {
  return <pre className="overflow-x-auto rounded-lg border bg-muted/50 px-4 py-3 font-mono text-sm leading-relaxed">{children}</pre>;
}

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 px-4 py-12 sm:px-6">
      <header className="space-y-3">
        <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Methodology</p>
        <h1 className="font-display text-5xl font-bold uppercase tracking-tight">How the model works</h1>
        <p className="text-lg text-muted-foreground">
          ApexStint’s simulator is a deterministic, additive lap-time model. It’s built to be understood, not to predict races. The same inputs always
          give the same output, and every second of a total can be traced to one of five components.
        </p>
      </header>

      <Callout tone="hypo" title="What this is not">
        It isn’t a reproduction of any team’s strategy software, and it doesn’t forecast what would have happened. It’s a transparent calculator for
        comparing strategies under assumptions you can see and change.
      </Callout>

      <section className="space-y-4">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">1 · Lap time</h2>
        <p>For lap j (1-based) of a stint on compound c, fitted with tyres that had already done a₀ laps, tyre age is a = a₀ + (j − 1) and:</p>
        <Formula>lapTime = B + Δc + d_c · a + k_c · max(0, a − L_c + 1)</Formula>
        <ul className="grid gap-2 text-sm sm:grid-cols-2">
          <li>
            <strong>B</strong> base lap <Badge variant="recorded">from data</Badge>: median of the reference driver’s clean recorded laps
          </li>
          <li>
            <strong>Δc</strong> compound pace offset <Badge variant="hypo">assumption</Badge>
          </li>
          <li>
            <strong>d_c</strong> linear wear, s per lap of age <Badge variant="hypo">assumption</Badge>
          </li>
          <li>
            <strong>L_c, k_c</strong> cliff onset and extra wear <Badge variant="hypo">assumption</Badge>
          </li>
        </ul>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">2 · Race time</h2>
        <Formula>{`total = Σ lapTime  +  P × (charged stops)

      = base (N·B) + compound (ΣΔc) + wear (Σ d_c·a) + cliff (Σ k_c·…) + pit (P·stops)`}</Formula>
        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">P</strong> is the pit loss per stop <Badge variant="recorded">from data</Badge>, defaulting to the race’s
          median recorded pit-lane time, rounded to 0.5 s. It is charged on the in-lap. A stop marked <em>free</em> (e.g. tyres changed under a red
          flag) costs nothing. Because the five components add up exactly, the gap between two strategies is the sum of five differences. That’s
          what the “Why the totals differ” panel shows.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">3 · Worked example</h2>
        <p className="text-sm">With B = 95 s, P = 22 s, Medium (Δ 0, d 0.06) for 20 laps then Hard (Δ +0.4, d 0.035) for 37 laps and no cliffs:</p>
        <Formula>{`base     57 × 95                       = 5415.000
compound 20 × 0 + 37 × 0.4             =   14.800
wear     0.06 × Σ0..19 + 0.035 × Σ0..36
         = 0.06 × 190 + 0.035 × 666    =   34.710
pit      1 × 22                        =   22.000
total                                  = 5486.510 s  (1:31:26.510)`}</Formula>
        <p className="text-xs text-muted-foreground">This exact example is checked by a unit test.</p>
      </section>

      <section className="space-y-4">
        <h2 className="font-display text-3xl font-bold uppercase tracking-wide">4 · Default tyre assumptions</h2>
        <p className="text-sm text-muted-foreground">
          Round, illustrative numbers chosen to make the trade-offs visible. They aren’t measured, fitted or taken from any supplier, and every one can
          be edited in the lab.
        </p>
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-medium">Compound</th>
                <th className="px-4 py-2 text-right font-medium">Offset (s)</th>
                <th className="px-4 py-2 text-right font-medium">Wear (s/lap)</th>
                <th className="px-4 py-2 text-right font-medium">Cliff at (laps)</th>
                <th className="px-4 py-2 text-right font-medium">Cliff (s/lap)</th>
              </tr>
            </thead>
            <tbody>
              {DRY_COMPOUNDS.map((c) => {
                const m = DEFAULT_COMPOUNDS[c];
                return (
                  <tr key={c} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2">
                      <span className="flex items-center gap-2">
                        <CompoundDot compound={c} /> {COMPOUND_META[c].label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-mono tabular">{m.paceOffsetSec.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular">{m.degSecPerLap.toFixed(3)}</td>
                    <td className="px-4 py-2 text-right font-mono tabular">{m.cliffAfterLaps ?? "—"}</td>
                    <td className="px-4 py-2 text-right font-mono tabular">{m.cliffSecPerLap.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Data preparation</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                A lap is <em>clean</em> unless it is lap 1, an in- or out-lap, has no time, or is more than {Math.round((OUTLIER_FACTOR - 1) * 100)}% slower
                than that driver’s median (Safety Car, VSC, red flag, incidents).
              </li>
              <li>
                Pit-lane visits over {STOPPAGE_PIT_MS / 60_000} minutes are red-flag stoppages: not counted as stops, and free in “as raced” strategies.
                Real stops over {LONG_PIT_MS / 1000} s still count as stops but are left out of the pit-loss default.
              </li>
              <li>“As raced” strategies are rebuilt from recorded stints only when they cover the full distance with known compounds.</li>
              <li>A missing value is never filled with a guess. The UI shows a dash or a hatched “unknown” bar instead.</li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Not modelled</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Fuel burn. It shifts every strategy equally over the same distance, so it can’t change their order.</li>
              <li>Traffic, overtaking difficulty, track position and undercut/overcut effects.</li>
              <li>Safety Cars, VSCs, weather, track evolution and tyre warm-up.</li>
              <li>Non-linear wear beyond a single cliff, and driver-specific tyre management.</li>
              <li>Tyre allocation limits and other sporting rules, apart from a two-compound warning for dry races.</li>
            </ul>
          </CardContent>
        </Card>
      </section>

      <p className="text-sm text-muted-foreground">
        The implementation is in <code>src/lib/sim/model.ts</code> and <code>src/lib/sim/compare.ts</code>, with unit tests alongside. Ready to try it?{" "}
        <Link href="/" className="underline underline-offset-2">
          Pick a race
        </Link>
        .
      </p>
    </div>
  );
}

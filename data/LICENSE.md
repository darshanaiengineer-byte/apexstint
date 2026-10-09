# Data licence and attribution

> This is a summary of published terms, not legal advice. **The project is not cleared for
> commercial use.** See "Commercial distribution" below.

## Sources and their published terms (checked 2026-10-09)

| Source | What ApexStint uses | Published terms | Evidence |
| --- | --- | --- | --- |
| **Jolpica-F1 API** (Ergast-compatible) | drivers, results, lap timings, pit stops; race name, date and circuit | Data: **CC BY-NC-SA 4.0**. "Freely available for non-commercial use … For commercial usage, please contact us via admin@jolpi.ca". The terms may change. Jolpica's *code* is separately Apache-2.0, which does **not** cover the data. | `TERMS.md` (last updated 2025-08-27) and `LICENSE` in https://github.com/jolpica/jolpica-f1 |
| **OpenF1 API** | tyre stints (compound, start/end lap, tyre age at start) | Project and site: **CC BY-NC-SA 4.0** ("© OpenF1. Licensed under CC BY-NC-SA 4.0"). Intended "for educational purposes, personal learning projects, research, and non-commercial fan engagement. For other use cases, please contact us". OpenF1 states it "does not claim ownership of Formula 1 data, trademarks, or broadcasts", and its data is ingested from Formula 1's live-timing feed. | `LICENSE` and `README.md` in https://github.com/br-g/openf1; FAQ and footer on https://openf1.org |

Licence text: https://creativecommons.org/licenses/by-nc-sa/4.0/

## Which files are covered

| File(s) | Contents | Terms |
| --- | --- | --- |
| `data/races/*.json`: `drivers`, `results`, `laps`, `pitStops`, `raceName`, `date`, `circuit`, `scheduledLaps` (derived from results) | Jolpica-F1 data | CC BY-NC-SA 4.0 (Jolpica) |
| `data/races/*.json`: `stints` | OpenF1 data | CC BY-NC-SA 4.0 (OpenF1), subject to OpenF1's disclaimer about underlying F1 data |
| `data/races/*.json`: `missingFields`, `notes`, `sources`, `id`, `kind`, `schemaVersion` | Written by ApexStint (e.g. the Japan red-flag note) | Inside the adapted dataset, so distributed under CC BY-NC-SA 4.0 (ShareAlike) |
| `data/index.json` | Race ids and names (from Jolpica) | CC BY-NC-SA 4.0 |
| Values derived at runtime and shown in the app (medians, timelines, classifications) | Adaptations of the above | Same NC/SA conditions when displayed or redistributed |
| Test files quoting dataset values (`src/lib/data/dataset.test.ts`, `e2e/*.spec.ts`) | Small factual excerpts (e.g. a pit time, stint lengths) | Derived from the covered data; treat as covered |

**Not covered (independently written by this project):**
- The simulator and its hypothetical tyre defaults (`src/lib/sim/*`).
- All application code and UI text outside `data/`.
- The synthetic test fixture (`src/test/fixtures.ts`).

No code licence has been chosen yet. No independently sourced data with different terms is bundled; every recorded value comes from one of the two sources above.

## What the licence requires (and how ApexStint complies)

- **Attribution (BY):** credit both sources and link the licence. Done in the site footer, on `/data` and in this file.
- **Indicate changes:** field names normalised, clock strings converted to milliseconds, OpenF1 car numbers mapped to Jolpica driver ids, absent values written as `null`, and per-race `missingFields` and `notes` added. No values were synthesised. Regenerate with `npm run data:fetch`.
- **NonCommercial (NC):** the data and anything shown from it may not be used primarily for commercial advantage or monetary compensation.
- **ShareAlike (SA):** this adapted dataset is distributed under the same licence, CC BY-NC-SA 4.0.

## Commercial distribution

Not cleared. On the evidence above:

1. Both providers license their data **non-commercially only**, and both direct commercial users to contact them. No such permission has been sought or granted.
2. OpenF1 explicitly **does not claim ownership** of the underlying Formula 1 data. Its licence can't grant rights it doesn't hold, so commercial use may also need permission from the underlying rights holders. Jolpica's terms don't address underlying ownership either way.
3. "Formula 1", "F1" and related marks belong to Formula One Licensing B.V. ApexStint uses race names descriptively, carries a non-affiliation notice, and uses no logos. That reduces trademark risk but isn't a licence.

Options for commercial use include obtaining written permission from Jolpica and OpenF1 (and, where needed, a licence for official F1 data), or replacing `data/` with a source whose terms permit commercial use. The `RaceRepository` interface is designed for that swap.

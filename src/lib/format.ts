/** Display formatting. All inputs may be null; output is "—" in that case. */

const DASH = "—";

/** seconds → "1:31:44.742" / "1:32.608" / "23.400" */
export function fmtClock(sec: number | null | undefined, decimals = 3): string {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  const neg = sec < 0;
  const scale = 10 ** decimals;
  // Work in integer units of the last decimal so rounding never yields "60.000".
  let units = Math.round(Math.abs(sec) * scale);
  const h = Math.floor(units / (3600 * scale));
  units -= h * 3600 * scale;
  const m = Math.floor(units / (60 * scale));
  units -= m * 60 * scale;
  let secStr = (units / scale).toFixed(decimals);
  if (h > 0 || m > 0) secStr = secStr.padStart(decimals > 0 ? decimals + 3 : 2, "0");
  const body = h > 0 ? `${h}:${String(m).padStart(2, "0")}:${secStr}` : m > 0 ? `${m}:${secStr}` : secStr;
  return neg ? `-${body}` : body;
}

/** 92608 → "1:32.608" */
export function fmtLapMs(ms: number | null | undefined): string {
  return ms == null ? DASH : fmtClock(ms / 1000, 3);
}

/** seconds → "+12.345s" */
export function fmtGap(sec: number | null | undefined, decimals = 3): string {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  if (Math.abs(sec) < 0.5 / 10 ** decimals) return "±0";
  return `${sec > 0 ? "+" : "−"}${fmtClock(Math.abs(sec), decimals)}s`;
}

export function fmtSec(sec: number | null | undefined, decimals = 1): string {
  if (sec == null || !Number.isFinite(sec)) return DASH;
  return `${sec.toFixed(decimals)} s`;
}

/** Classified position text → label: "1" → "P1", "R" → "Ret" (Ergast status letters otherwise). */
export function fmtPosition(positionText: string): string {
  if (/^\d+$/.test(positionText)) return `P${positionText}`;
  const map: Record<string, string> = { R: "Ret", D: "DSQ", E: "Excl", W: "WD", F: "DNQ", N: "NC" };
  return map[positionText] ?? positionText;
}

export function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

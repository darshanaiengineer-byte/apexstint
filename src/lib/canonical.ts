/**
 * Canonical JSON: a deterministic serialisation used for identities (dataset versions,
 * experiment ids). Object keys are sorted recursively, so key order never changes the result.
 *
 * Unlike JSON.stringify, non-finite numbers are encoded as `{ "$nonFinite": "NaN" | "Infinity" |
 * "-Infinity" }` instead of collapsing to null, and `undefined` object values are omitted.
 * Limitation: an input that literally contains such an object serialises the same as the
 * number it stands for. Typed experiment specs and race files never contain a `$nonFinite` key,
 * so this cannot happen for the identities computed here.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalise(value));
}

function normalise(value: unknown): unknown {
  if (typeof value === "number") return Number.isFinite(value) ? value : { $nonFinite: String(value) };
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => (v === undefined ? null : normalise(v)));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const v = (value as Record<string, unknown>)[key];
    if (v !== undefined) out[key] = normalise(v);
  }
  return out;
}

// BigInt() calls rather than literals: the project targets ES2017.
const FNV_OFFSET = BigInt("0xcbf29ce484222325");
const FNV_PRIME = BigInt("0x100000001b3");
const MASK_64 = BigInt("0xffffffffffffffff");

/**
 * 64-bit FNV-1a over the UTF-8 bytes of `text`, as 16 hex characters. Deterministic on every
 * platform and synchronous (usable in the browser render path). An identifier, not a
 * security primitive: do not rely on it for collision resistance against an attacker.
 */
export function fnv1a64(text: string): string {
  let hash = FNV_OFFSET;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= BigInt(byte);
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash.toString(16).padStart(16, "0");
}

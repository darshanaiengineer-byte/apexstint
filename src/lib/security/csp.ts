/**
 * Content-Security-Policy for ApexStint, built per request by `src/proxy.ts`.
 *
 * Derived from an audit of the production HTML (see docs/security/threat-model.md):
 * - every script is first-party, but each page also has 3–5 *inline* scripts (Next.js RSC flight
 *   data and bootstrap, plus the next-themes anti-flash script), so scripts are allowed only by
 *   a per-request nonce, with 'strict-dynamic' to trust the chunks those scripts load;
 * - there are no <style> elements, but server-rendered `style="…"` attributes are pervasive
 *   (stint timeline widths, compound colours, charts). Nonces cannot apply to attributes, so the
 *   one exception is `style-src-attr 'unsafe-inline'`; <style> elements still need the nonce;
 * - images, fonts and data are same-origin only; nothing is framed, posted or loaded as a plugin.
 */

export interface CspOptions {
  /** Base64 nonce, unique per response. */
  nonce: string;
  /** `next dev` only: React needs eval for debugging and dev CSS is injected without a nonce. */
  dev?: boolean;
  /** Add `upgrade-insecure-requests` (only meaningful when the page itself is served over HTTPS). */
  https?: boolean;
}

const NONCE_PATTERN = /^[A-Za-z0-9+/]{16,}={0,2}$/;

/** 128 bits from the platform CSPRNG, base64-encoded. Never reuse across responses. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function buildCsp({ nonce, dev = false, https = false }: CspOptions): string {
  if (!NONCE_PATTERN.test(nonce)) throw new Error("CSP nonce must be base64 (at least 16 characters)");
  const directives: [string, ...string[]][] = [
    ["default-src", "'self'"],
    ["script-src", "'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(dev ? ["'unsafe-eval'"] : [])],
    // Production: <style> elements must carry the nonce. Dev: Next injects HMR styles without one,
    // and browsers ignore 'unsafe-inline' whenever a nonce is present, so dev omits the nonce.
    ["style-src", "'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    ["style-src-attr", "'unsafe-inline'"],
    ["img-src", "'self'"],
    ["font-src", "'self'"],
    ["connect-src", "'self'"],
    ["worker-src", "'none'"],
    ["manifest-src", "'self'"],
    ["object-src", "'none'"],
    ["base-uri", "'none'"],
    ["form-action", "'none'"],
    ["frame-ancestors", "'none'"],
  ];
  if (https) directives.push(["upgrade-insecure-requests"]);
  return directives.map((d) => d.join(" ")).join("; ");
}

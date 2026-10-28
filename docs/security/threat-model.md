# Threat model

_Scope: the application as it exists on 2026-10-27 — a Next.js app rendered per request (for the CSP nonce), with no accounts, no database, no server-side writes and no secrets._

## Assets

1. **Integrity of displayed results** — users rely on simulated totals and recorded data being what they claim.
2. **Availability** of the public site.
3. **The repository and its supply chain** — dependencies, CI, the publishing account.
4. **Licensing posture** — attribution and the non-commercial data restriction.

## Trust boundaries and entry points

| Entry point | Trust | Handling (confirmed in code) |
| --- | --- | --- |
| `?cfg=` share-link parameter (strategy route, server-rendered) | **Untrusted** | Length-capped (4,000 chars) before decoding; base64url → JSON parse in try/catch → zod schema with bounded numbers and array sizes from `contract.ts`; unknown driver or another race ⇒ rejected with a notice; never executed or rendered as HTML |
| Route params (`/races/[id]`) | Untrusted | Looked up in a fixed registry; unknown ⇒ 404 |
| Bundled race data (`data/`) | Trusted at build, but third-party origin | Schema-validated at load and in CI; rendered as React text only |
| Dependencies (npm) | Third-party | Lockfile + `npm ci`; `npm audit` gate in CI; Dependabot |
| CI (GitHub Actions) | Trusted infrastructure | `permissions: contents: read`; no secrets used; only GitHub's own `actions/*` |

## Threats and mitigations

| Threat | Status |
| --- | --- |
| Crafted `cfg` causing a crash, NaN/Infinity results or misleading output | **Mitigated**: schema + shared limits; the simulator independently fails closed (ADR-002) |
| Crafted `cfg` causing memory/CPU exhaustion during validation | **Mitigated**: 4,000-char cap before parsing; bounded arrays; `zod` upgraded past GHSA-mrhx-c7xc-m3w5 |
| Stale or cross-race links silently showing different numbers | **Mitigated for links with provenance**: `r`/`dv`; cross-race links rejected, stale links warned (ADR-003). **Residual**: links created before provenance existed cannot be checked |
| XSS via data or link content | **Mitigated**: no `dangerouslySetInnerHTML`/`eval`; React escaping; **defence in depth**: nonce-based CSP blocks injected or third-party scripts (see below). **Residual**: inline style attributes are allowed |
| A dataset served under the wrong race route | **Mitigated**: generated registry requires `id` = filename = route; the repository rejects key/`id` mismatches (ADR-006) |
| Clickjacking, MIME sniffing | **Mitigated**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed |
| Vulnerable framework/dependency (e.g. next@16.4.0: two critical RCE and one high DoS advisory; exploitability of the deployed build not verified) | **Mitigated now** (upgraded); **detected going forward** by the CI audit step + Dependabot. Residual: the window between disclosure and the next CI run |
| Malicious dependency update | **Partially mitigated**: lockfile, PR-based updates gated by CI; no provenance/attestation checks |
| Data misrepresentation (invented or mislabelled values) | **Mitigated**: schema, null-not-guess policy, "recorded"/"hypothetical" labelling, long-stop vs stoppage classification tests |
| Licence violation (commercial use, missing attribution) | **Documented**: `data/LICENSE.md`; footer and `/data` attribution; not cleared commercially |
| Publishing-account compromise or wrong account | Out of app scope; the repo uses a dedicated SSH key and a noreply identity |

## Not applicable today (re-assess when introduced)

Authentication/authorisation, tenant isolation, rate limiting of expensive compute, secrets management, server-side persistence. The planned AI layer (roadmap Milestone 4) **will** introduce an LLM provider credential, untrusted model output, prompt-injection risk from data, and cost-exhaustion risk. It must ship with tool allow-lists, typed tool inputs validated by `contract.ts`, no shell or file access, per-request compute limits and its own threat-model update.

## Content-Security-Policy (implemented 2026-10-27, ADR-007)

**Where.** `src/proxy.ts` builds the policy with `src/lib/security/csp.ts` for every request except exactly: files under `/_next/static/`, the `/_next/image` optimiser, `/favicon.ico` and `/icon.svg` (anchored; dots escaped). An earlier unanchored matcher also exempted look-alike paths such as `/icon.svgx` or `/_next/staticfoo`, which return the HTML 404 page, so that page was served without a CSP; found in the 2026-10-28 final review, fixed, and covered by a regression test that requires a CSP on every HTML response. Prefetch-flagged requests are **not** exempt either: an earlier matcher (copied from the Next.js guide) skipped requests with `purpose: prefetch` or `next-router-prefetch`, which then returned full HTML with no CSP and with client-supplied nonce headers reaching rendering; found in the 2026-10-28 audit, fixed, and covered by regression tests and sets it on the response. The nonce is passed to rendering in request headers; any client-supplied `x-nonce` is overwritten. Static headers (`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`) remain in `next.config.ts`.

**Policy (production).**

| Directive | Value | Why |
| --- | --- | --- |
| `script-src` | `'self' 'nonce-<per request>' 'strict-dynamic'` | Next.js and next-themes need inline scripts; only nonce-bearing scripts (and chunks they load) run. No `'unsafe-inline'`, no `'unsafe-eval'` (zod runs `jitless`) |
| `style-src` | `'self' 'nonce-<per request>'` | Stylesheets are same-origin; next-themes injects nonce-bearing `<style>` elements when the theme changes |
| `style-src-attr` | `'unsafe-inline'` | **The one exception**: React server-renders `style="…"` attributes (timeline widths, compound colours, charts); nonces cannot apply to attributes |
| `default-src`, `img-src`, `font-src`, `connect-src`, `manifest-src` | `'self'` | All assets are first-party (fonts self-hosted by `next/font`); no third-party connections |
| `worker-src`, `object-src`, `base-uri`, `form-action`, `frame-ancestors` | `'none'` | No workers, plugins, `<base>`, forms or framing |
| `upgrade-insecure-requests` | only when served over HTTPS | Omitted on plain-HTTP local servers |

**What it mitigates.** Execution of injected inline scripts or scripts from other origins; framing (clickjacking); plugin content; `<base>`-tag hijacking; form exfiltration.
**What it does not.** It does not stop CSS-based attacks via style attributes (allowed), data exfiltration through same-origin requests, or bugs in first-party code. It is not a substitute for output escaping. `'strict-dynamic'` trusts any script a nonce-bearing script loads.

**Nonce properties (verified).** 128 bits from the platform CSPRNG, base64; 50/50 unique across consecutive responses; every `<script>` in the HTML carries the response's nonce; responses are `Cache-Control: private, no-cache, no-store`, so nonce-bearing HTML is not reused.

**How to test.**
- Locally: `npm run build && npm run test:e2e` runs `e2e/csp.spec.ts` against `next start`. It fails on any `securitypolicyviolation`, console error or page error across every route, the 404 page, navigation, lab editing, charts and share links. Unit tests in `src/lib/security/csp.test.ts` pin each directive.
- In production: `curl -sI https://<host>/ | grep -i content-security-policy` should show a different nonce on each request and include `upgrade-insecure-requests`; the browser console should show no CSP violations.

**Deployment requirements.** A Node server (`next start`, Vercel or a container); not a static host. Do not put a shared cache in front of HTML responses. A hosting layer must not add a second, conflicting CSP header.

**Audit 2026-10-28 (runtime-verified).** `style-src-attr 'unsafe-inline'` is required: without it Chromium blocked 9/290/31 style attributes on `/`, a race page and the lab, collapsing timeline bars. `NODE_ENV` is inlined at build, so development allowances cannot appear in production even if the server starts with `NODE_ENV=development`. `default-src 'self'` is the fallback for unlisted fetch directives (e.g. same-origin frames); inline event-handler attributes are blocked because `script-src` has no `'unsafe-inline'`/`'unsafe-hashes'`.

**Limitations of the verification.** Verified in headless Chromium against a local production server over HTTP. Firefox/WebKit and a real HTTPS deployment (including `upgrade-insecure-requests`) have not been tested. There is no violation-reporting endpoint, so violations in the field would not be observed.

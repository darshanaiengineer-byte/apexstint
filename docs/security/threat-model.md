# Threat model

_Scope: the application as it exists on 2026-10-27 — a statically built Next.js app with one dynamic route, no accounts, no database, no server-side writes, no secrets._

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
| XSS via data or link content | **Mitigated in practice**: no `dangerouslySetInnerHTML`/`eval`; React escaping. **Gap**: no CSP as defence in depth |
| Clickjacking, MIME sniffing | **Mitigated**: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`; `X-Powered-By` removed |
| Vulnerable framework/dependency (e.g. next@16.4.0: two critical RCE and one high DoS advisory; exploitability of the deployed build not verified) | **Mitigated now** (upgraded); **detected going forward** by the CI audit step + Dependabot. Residual: the window between disclosure and the next CI run |
| Malicious dependency update | **Partially mitigated**: lockfile, PR-based updates gated by CI; no provenance/attestation checks |
| Data misrepresentation (invented or mislabelled values) | **Mitigated**: schema, null-not-guess policy, "recorded"/"hypothetical" labelling, long-stop vs stoppage classification tests |
| Licence violation (commercial use, missing attribution) | **Documented**: `data/LICENSE.md`; footer and `/data` attribution; not cleared commercially |
| Publishing-account compromise or wrong account | Out of app scope; the repo uses a dedicated SSH key and a noreply identity |

## Not applicable today (re-assess when introduced)

Authentication/authorisation, tenant isolation, rate limiting of expensive compute, secrets management, server-side persistence. The planned AI layer (roadmap Milestone 4) **will** introduce an LLM provider credential, untrusted model output, prompt-injection risk from data, and cost-exhaustion risk. It must ship with tool allow-lists, typed tool inputs validated by `contract.ts`, no shell or file access, per-request compute limits and its own threat-model update.

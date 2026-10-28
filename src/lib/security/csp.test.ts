import { describe, expect, it } from "vitest";
import { buildCsp, generateNonce } from "./csp";

const directives = (csp: string) => new Map(csp.split("; ").map((d) => [d.split(" ")[0], d.split(" ").slice(1)] as const));
const NONCE = "AAAAAAAAAAAAAAAAAAAAAA==";

describe("generateNonce", () => {
  it("is 128 random bits, base64-encoded, and not repeated", () => {
    const nonces = Array.from({ length: 1000 }, generateNonce);
    for (const n of nonces) {
      expect(n).toMatch(/^[A-Za-z0-9+/]{22}==$/);
      expect(Buffer.from(n, "base64")).toHaveLength(16);
    }
    expect(new Set(nonces).size).toBe(nonces.length);
  });
});

describe("buildCsp (production)", () => {
  const d = directives(buildCsp({ nonce: NONCE }));

  it("allows scripts only via the nonce (+ strict-dynamic), never inline or eval", () => {
    expect(d.get("script-src")).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
  });

  it("requires the nonce for <style> elements; inline style *attributes* are the one exception", () => {
    expect(d.get("style-src")).toEqual(["'self'", `'nonce-${NONCE}'`]);
    expect(d.get("style-src-attr")).toEqual(["'unsafe-inline'"]);
  });

  it("is same-origin or none for everything else", () => {
    expect(Object.fromEntries(d)).toMatchObject({
      "default-src": ["'self'"],
      "img-src": ["'self'"],
      "font-src": ["'self'"],
      "connect-src": ["'self'"],
      "worker-src": ["'none'"],
      "manifest-src": ["'self'"],
      "object-src": ["'none'"],
      "base-uri": ["'none'"],
      "form-action": ["'none'"],
      "frame-ancestors": ["'none'"],
    });
  });

  it("contains no wildcard, data:, blob: or unsafe-eval sources", () => {
    const csp = buildCsp({ nonce: NONCE });
    expect(csp).not.toMatch(/\*|data:|blob:|'unsafe-eval'|'unsafe-hashes'/);
    expect(csp.match(/'unsafe-inline'/g)).toHaveLength(1); // style-src-attr only
  });

  it("adds upgrade-insecure-requests only for HTTPS", () => {
    expect(directives(buildCsp({ nonce: NONCE })).has("upgrade-insecure-requests")).toBe(false);
    expect(directives(buildCsp({ nonce: NONCE, https: true })).has("upgrade-insecure-requests")).toBe(true);
  });
});

describe("buildCsp (development)", () => {
  it("relaxes only what next dev needs", () => {
    const d = directives(buildCsp({ nonce: NONCE, dev: true }));
    expect(d.get("script-src")).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'", "'unsafe-eval'"]);
    expect(d.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe("buildCsp input validation", () => {
  it.each(["", "short", "has spaces in it!!", "x'; script-src *; '", "AAAA AAAA AAAA AAAA"])("rejects an unsafe nonce %j", (nonce) => {
    expect(() => buildCsp({ nonce })).toThrow(/nonce must be base64/);
  });
});

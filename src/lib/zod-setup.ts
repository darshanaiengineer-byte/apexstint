import { z } from "zod";

/**
 * Run zod without its eval-based JIT. Zod probes `new Function` to decide whether to compile
 * parsers; under our Content-Security-Policy (no 'unsafe-eval') that probe is blocked and
 * reported as a `securitypolicyviolation`, even though zod catches it and falls back.
 * `jitless` skips the probe and uses the interpreter, with identical validation results.
 * Imported (for its side effect) by every module that defines zod schemas, so it applies
 * before the first parse on both server and client, regardless of import order.
 */
z.config({ jitless: true });

import { describe, expect, it } from "vitest";
import { fmtClock, fmtGap, fmtLapMs, fmtPosition } from "./format";

describe("fmtClock", () => {
  it("formats seconds, minutes and hours", () => {
    expect(fmtClock(23.4)).toBe("23.400");
    expect(fmtClock(92.608)).toBe("1:32.608");
    expect(fmtClock(5504.742)).toBe("1:31:44.742");
    expect(fmtClock(5486.51)).toBe("1:31:26.510");
  });

  it("never renders 60 seconds after rounding", () => {
    expect(fmtClock(59.9996)).toBe("1:00.000");
    expect(fmtClock(3599.9999)).toBe("1:00:00.000");
  });

  it("handles negatives and missing values", () => {
    expect(fmtClock(-1.5, 1)).toBe("-1.5");
    expect(fmtClock(null)).toBe("—");
    expect(fmtClock(Number.NaN)).toBe("—");
    expect(fmtLapMs(null)).toBe("—");
  });
});

describe("fmtGap / fmtPosition", () => {
  it("signs gaps", () => {
    expect(fmtGap(5.88)).toBe("+5.880s");
    expect(fmtGap(-1677.8, 1)).toBe("−27:57.8s");
    expect(fmtGap(0)).toBe("±0");
  });

  it("labels non-numeric classifications", () => {
    expect(fmtPosition("1")).toBe("P1");
    expect(fmtPosition("R")).toBe("Ret");
    expect(fmtPosition("D")).toBe("DSQ");
    expect(fmtPosition("?")).toBe("?");
  });
});

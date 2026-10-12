import { afterEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createFormat, useFormat } from "./useFormat";
import { useI18n } from "./useI18n";

const en = createFormat("en-US");
const de = createFormat("de-DE");
// A local-time timestamp, so the expectation holds in any time zone.
const at = new Date(2026, 8, 26, 14, 5, 9);

afterEach(() => useI18n().setLanguage("en"));

describe("date and time", () => {
  it("formats the time of day per locale", () => {
    expect(en.time(at)).toMatch(/^02:05\s?PM$/);
    expect(de.time(at)).toBe("14:05");
  });

  it("formats dates and date-times per locale", () => {
    expect(en.date(at)).toBe("Sep 26, 2026");
    expect(de.date(at)).toBe("26.09.2026");
    expect(de.dateTime(at)).toMatch(/^26\.09\.2026,? 14:05$/);
  });

  it("accepts a timestamp and an ISO string", () => {
    expect(de.time(at.getTime())).toBe("14:05");
    expect(de.date("2026-09-26T12:00:00")).toBe("26.09.2026");
  });
});

describe("number, percent, unit", () => {
  it("groups and separates per locale", () => {
    expect(en.number(1234.5)).toBe("1,234.5");
    expect(de.number(1234.5)).toBe("1.234,5");
  });

  it("formats a fraction as a percent with optional digits", () => {
    expect(en.percent(0.256)).toBe("26%");
    expect(de.percent(0.256, 1)).toMatch(/^25,6\s%$/);
  });

  it("formats units Intl knows", () => {
    expect(en.unit(40, "millisecond")).toBe("40 ms");
    expect(de.unit(40, "millisecond")).toBe("40 ms");
    expect(en.unit(128, "kilobit-per-second")).toMatch(/^128 kb\/s$/);
    expect(en.unit(2, "second", { style: "long" })).toBe("2 seconds");
    expect(de.unit(2, "second", { style: "long" })).toBe("2 Sekunden");
  });

  it("falls back to a label for a unit Intl does not have", () => {
    expect(en.unit(60, "frame-per-second", { fallback: "FPS" })).toBe("60 FPS");
    expect(de.unit(1234, "frame-per-second", { fallback: "FPS" })).toBe("1.234 FPS");
  });
});

describe("duration", () => {
  it("shows the two largest non-zero units", () => {
    expect(en.duration(3900)).toBe("1h 5m");
    expect(en.duration(45)).toBe("45s");
    expect(en.duration(90061)).toBe("1d 1h");
  });

  it("skips zero units in the middle and honors maxParts", () => {
    expect(en.duration(3605)).toBe("1h 5s");
    expect(en.duration(3905, { maxParts: 3 })).toBe("1h 5m 5s");
  });

  it("shows zero seconds for nothing, and clamps negatives", () => {
    expect(en.duration(0)).toBe("0s");
    expect(en.duration(-5)).toBe("0s");
  });

  it("uses the locale's unit names", () => {
    expect(de.duration(3900, { style: "short" })).toBe("1 Std. 5 Min.");
    expect(en.duration(3900, { style: "long" })).toBe("1 hour 5 minutes");
  });
});

describe("list and relative", () => {
  it("joins with the locale's conjunction", () => {
    expect(en.list(["a", "b", "c"])).toBe("a, b, and c");
    expect(de.list(["a", "b", "c"])).toBe("a, b und c");
    expect(en.list(["a", "b"], "disjunction")).toBe("a or b");
  });

  it("picks the largest fitting unit", () => {
    const now = new Date(2026, 8, 26, 12, 0, 0);
    expect(en.relative(new Date(2026, 8, 26, 11, 55, 0), now)).toBe("5 minutes ago");
    expect(en.relative(new Date(2026, 8, 26, 14, 0, 0), now)).toBe("in 2 hours");
    expect(de.relative(new Date(2026, 8, 25, 12, 0, 0), now)).toBe("gestern");
    expect(en.relative(now, now)).toBe("now");
  });
});

describe("useFormat", () => {
  it("follows the active language on every call", () => {
    const format = useFormat();
    useI18n().setLanguage("en");
    expect(format.number(1234.5)).toBe("1,234.5");
    useI18n().setLanguage("de");
    expect(format.number(1234.5)).toBe("1.234,5");
    expect(format.locale).toBe("de-DE");
  });

  it("re-renders a component on a language switch", async () => {
    useI18n().setLanguage("en");
    const wrapper = mount(
      defineComponent({
        setup: () => {
          const format = useFormat();
          return () => h("p", format.number(1234.5));
        },
      }),
    );
    expect(wrapper.text()).toBe("1,234.5");
    useI18n().setLanguage("de");
    await nextTick();
    expect(wrapper.text()).toBe("1.234,5");
  });
});

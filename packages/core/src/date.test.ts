import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveDate, resolveDateRange, type DateRange } from "./date.js";

// Saturday, 8 August 2026, 15:30 local time. Constructed from parts (not parsed from
// a string) so these assertions hold in any timezone.
const NOW = new Date(2026, 7, 8, 15, 30, 0, 0);

/** Local calendar day as YYYY-MM-DD — timezone-independent, unlike toISOString(). */
function ymd(date: Date): string {
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function span(range: DateRange | null): string {
  assert.notEqual(range, null, "expected a resolved range");
  const r = range as DateRange;
  return `${ymd(r.from)}..${ymd(r.to)}`;
}

// --- resolveDate: a single point in time -----------------------------------

test("resolveDate: null and unrecognised text fall back to now", () => {
  assert.equal(resolveDate(null, NOW).getTime(), NOW.getTime());
  assert.equal(resolveDate("whenever", NOW).getTime(), NOW.getTime());
});

test("resolveDate: today and yesterday", () => {
  assert.equal(ymd(resolveDate("today", NOW)), "2026-08-08");
  assert.equal(ymd(resolveDate("yesterday", NOW)), "2026-08-07");
});

test("resolveDate: N days ago and ISO dates", () => {
  assert.equal(ymd(resolveDate("3 days ago", NOW)), "2026-08-05");
  assert.equal(ymd(resolveDate("2026-07-20", NOW)), "2026-07-20");
});

test("resolveDate: crosses a month boundary correctly", () => {
  assert.equal(ymd(resolveDate("10 days ago", NOW)), "2026-07-29");
});

// --- resolveDateRange: an inclusive window ---------------------------------

test("resolveDateRange: no period named returns null, so nothing is filtered", () => {
  assert.equal(resolveDateRange(null, NOW), null);
  assert.equal(resolveDateRange("", NOW), null);
  assert.equal(resolveDateRange("at some point", NOW), null);
});

test("resolveDateRange: today spans exactly one calendar day", () => {
  const range = resolveDateRange("today", NOW);
  assert.equal(span(range), "2026-08-08..2026-08-08");
  const r = range as DateRange;
  assert.equal(r.from.getHours(), 0);
  assert.equal(r.from.getMinutes(), 0);
  assert.equal(r.to.getHours(), 23);
  assert.equal(r.to.getMilliseconds(), 999);
});

test("resolveDateRange: yesterday", () => {
  assert.equal(span(resolveDateRange("yesterday", NOW)), "2026-08-07..2026-08-07");
});

test("resolveDateRange: weeks start on Monday", () => {
  // NOW is a Saturday, so this week began Monday 3 August.
  assert.equal(span(resolveDateRange("this week", NOW)), "2026-08-03..2026-08-08");
  assert.equal(span(resolveDateRange("last week", NOW)), "2026-07-27..2026-08-02");
});

test("resolveDateRange: months", () => {
  assert.equal(span(resolveDateRange("this month", NOW)), "2026-08-01..2026-08-08");
  assert.equal(span(resolveDateRange("last month", NOW)), "2026-07-01..2026-07-31");
});

test("resolveDateRange: last month handles a January -> December rollover", () => {
  const january = new Date(2026, 0, 15, 9, 0, 0, 0);
  assert.equal(span(resolveDateRange("last month", january)), "2025-12-01..2025-12-31");
});

test("resolveDateRange: rolling day windows include today", () => {
  assert.equal(span(resolveDateRange("last 7 days", NOW)), "2026-08-02..2026-08-08");
  assert.equal(span(resolveDateRange("past 3 days", NOW)), "2026-08-06..2026-08-08");
});

test("resolveDateRange: a specific day", () => {
  assert.equal(span(resolveDateRange("3 days ago", NOW)), "2026-08-05..2026-08-05");
  assert.equal(span(resolveDateRange("2026-07-20", NOW)), "2026-07-20..2026-07-20");
});

test("resolveDateRange: possessives and articles are tolerated", () => {
  // "show last week's lunches" hands us the possessive form verbatim.
  assert.equal(span(resolveDateRange("last week's", NOW)), "2026-07-27..2026-08-02");
  assert.equal(span(resolveDateRange("  The Last Week  ", NOW)), "2026-07-27..2026-08-02");
});

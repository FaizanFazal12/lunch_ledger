/**
 * Deterministic natural-date resolution. The LLM only extracts the *text*
 * ("today", "yesterday", "last week"); this turns it into an actual Date or Date
 * range relative to `now`. No date arithmetic ever happens inside the model.
 */

/** An inclusive [from, to] window used to filter history queries. */
export interface DateRange {
  from: Date;
  to: Date;
}

/**
 * Resolve a date reference to a single point in time (used for "when did this
 * expense happen"). Anything unrecognised falls back to `now`, so an expense
 * always has a date.
 */
export function resolveDate(dateText: string | null, now: Date): Date {
  const text = normalize(dateText);
  if (text === null) return now;

  if (text === "today" || text === "now") return now;

  if (text === "yesterday") {
    return addDays(now, -1);
  }

  const daysAgo = /^(\d+)\s+days?\s+ago$/.exec(text);
  if (daysAgo?.[1] !== undefined) {
    return addDays(now, -Number.parseInt(daysAgo[1], 10));
  }

  const iso = parseIsoDay(text);
  if (iso !== null) return iso;

  return now;
}

/**
 * Resolve a date reference to an inclusive range (used for history queries such as
 * "show last week's lunches"). Returns null when the text names no recognisable
 * period — callers then list everything rather than silently filtering to nothing.
 *
 * Weeks start on Monday.
 */
export function resolveDateRange(dateText: string | null, now: Date): DateRange | null {
  const text = normalize(dateText);
  if (text === null) return null;

  if (text === "today" || text === "now") return dayRange(now);
  if (text === "yesterday") return dayRange(addDays(now, -1));

  if (text === "this week") return { from: startOfWeek(now), to: endOfDay(now) };
  if (text === "last week") {
    const start = addDays(startOfWeek(now), -7);
    return { from: start, to: endOfDay(addDays(start, 6)) };
  }

  if (text === "this month") return { from: startOfMonth(now), to: endOfDay(now) };
  if (text === "last month") {
    const start = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: start, to: endOfDay(end) };
  }

  if (text === "this year") {
    return { from: startOfDay(new Date(now.getFullYear(), 0, 1)), to: endOfDay(now) };
  }

  // "last 7 days" / "past 3 days" — a rolling window ending today.
  const lastDays = /^(?:last|past)\s+(\d+)\s+days?$/.exec(text);
  if (lastDays?.[1] !== undefined) {
    const count = Number.parseInt(lastDays[1], 10);
    if (count > 0) {
      return { from: startOfDay(addDays(now, -(count - 1))), to: endOfDay(now) };
    }
  }

  // "3 days ago" names one specific day.
  const daysAgo = /^(\d+)\s+days?\s+ago$/.exec(text);
  if (daysAgo?.[1] !== undefined) {
    return dayRange(addDays(now, -Number.parseInt(daysAgo[1], 10)));
  }

  const iso = parseIsoDay(text);
  if (iso !== null) return dayRange(iso);

  return null;
}

/**
 * Lower-case, trim, drop a possessive suffix ("last week's" -> "last week") and a
 * leading article, and collapse whitespace — so model output and the offline
 * parser both land on the same canonical keys.
 */
function normalize(dateText: string | null): string | null {
  if (dateText === null) return null;
  const text = dateText
    .trim()
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .replace(/^the\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0 ? null : text;
}

/** Parse a bare ISO day (2026-07-20) at local noon, or null. */
function parseIsoDay(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dayRange(date: Date): DateRange {
  return { from: startOfDay(date), to: endOfDay(date) };
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

function startOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function endOfDay(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(23, 59, 59, 999);
  return copy;
}

/** Monday-based start of the week containing `date`. */
function startOfWeek(date: Date): Date {
  const copy = startOfDay(date);
  const mondayOffset = (copy.getDay() + 6) % 7;
  copy.setDate(copy.getDate() - mondayOffset);
  return copy;
}

function startOfMonth(date: Date): Date {
  return startOfDay(new Date(date.getFullYear(), date.getMonth(), 1));
}

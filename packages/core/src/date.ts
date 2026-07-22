/**
 * Deterministic natural-date resolution. The LLM only extracts the *text*
 * ("today", "yesterday"); this turns it into an actual Date relative to `now`.
 * Anything it doesn't recognise falls back to `now`, so an expense always has a date.
 */
export function resolveDate(dateText: string | null, now: Date): Date {
  if (dateText === null) return now;
  const text = dateText.trim().toLowerCase();

  if (text === "today" || text === "now") return now;

  if (text === "yesterday") {
    return addDays(now, -1);
  }

  const daysAgo = /^(\d+)\s+days?\s+ago$/.exec(text);
  if (daysAgo && daysAgo[1] !== undefined) {
    return addDays(now, -Number.parseInt(daysAgo[1], 10));
  }

  // ISO date like 2026-07-20
  const iso = /^\d{4}-\d{2}-\d{2}$/.exec(text);
  if (iso) {
    const parsed = new Date(`${text}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  return now;
}

function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

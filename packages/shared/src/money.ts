/**
 * Money is stored internally as integer minor units (e.g. paisa/cents) to keep all
 * arithmetic deterministic and free of floating-point drift. The UI/LLM speak in whole
 * units (2500), the database and business logic speak in minor units (250000).
 */

const MINOR_UNITS_PER_MAJOR = 100;

/** Convert a whole-unit amount (2500) to integer minor units (250000). */
export function toMinorUnits(major: number): number {
  return Math.round(major * MINOR_UNITS_PER_MAJOR);
}

/** Convert integer minor units (250000) back to a whole-unit number (2500). */
export function toMajorUnits(minor: number): number {
  return minor / MINOR_UNITS_PER_MAJOR;
}

/** Format integer minor units for display, e.g. 250050 -> "2500.50". */
export function formatMinor(minor: number): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  const major = Math.floor(abs / MINOR_UNITS_PER_MAJOR);
  const rem = abs % MINOR_UNITS_PER_MAJOR;
  return rem === 0
    ? `${sign}${major}`
    : `${sign}${major}.${rem.toString().padStart(2, "0")}`;
}

/**
 * Split `totalMinor` equally across `count` shares, distributing any indivisible
 * remainder deterministically to the earliest shares. The returned shares always
 * sum exactly to `totalMinor`.
 *
 * e.g. splitEqually(250000, 3) -> [83334, 83333, 83333]
 */
export function splitEqually(totalMinor: number, count: number): number[] {
  if (count <= 0) {
    throw new Error("splitEqually: count must be a positive integer");
  }
  const base = Math.floor(totalMinor / count);
  let remainder = totalMinor - base * count;
  const shares: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const extra = remainder > 0 ? 1 : 0;
    shares.push(base + extra);
    remainder -= extra;
  }
  return shares;
}

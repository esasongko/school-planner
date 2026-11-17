// Browser-safe. ISO weekdays: 1 = Monday ... 7 = Sunday.
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
export const weekdayName = (n: number) => WEEKDAYS[n - 1] ?? "";

/** ISO weekday (1-7) of a YYYY-MM-DD date. */
export function isoWeekday(date: string): number {
  const d = new Date(date + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}

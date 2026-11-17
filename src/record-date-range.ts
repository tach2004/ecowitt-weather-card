/** HA-style date presets for recorded weather maxima; date-only arithmetic avoids DST drift. */
export type RecordPreset =
  | "today" | "yesterday" | "week" | "month" | "quarter" | "year"
  | "last7" | "last30" | "last365" | "last12months";
export type DateRange = { from: string; to: string };
export const RECORD_PRESETS: readonly { key: RecordPreset; label: string }[] = [
  { key: "today", label: "Heute" },
  { key: "yesterday", label: "Gestern" },
  { key: "week", label: "Diese Woche" },
  { key: "month", label: "Dieser Monat" },
  { key: "quarter", label: "Dieses Quartal" },
  { key: "year", label: "Dieses Jahr" },
  { key: "last7", label: "Letzte 7 Tage" },
  { key: "last30", label: "Letzte 30 Tage" },
  { key: "last365", label: "Letzte 365 Tage" },
  { key: "last12months", label: "Letzte 12 Monate" },
];

const DAY = 86_400_000;
export function dateMs(date: string): number {
  const ms = Date.parse(`${date}T12:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(ms) ||
      new Date(ms).toISOString().slice(0, 10) !== date)
    throw new Error("Ungültiges Kalenderdatum");
  return ms;
}
export function shiftDay(date: string, offset: number): string {
  return new Date(dateMs(date) + offset * DAY).toISOString().slice(0, 10);
}
export function shiftMonth(date: string, offset: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + offset, 1, 12));
  const maxDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, maxDay));
  return target.toISOString().slice(0, 10);
}
export function monthStart(date: string): string {
  return date.slice(0, 7) + "-01";
}
export function monthEnd(date: string): string {
  return shiftDay(shiftMonth(monthStart(date), 1), -1);
}
export function rangeForPreset(preset: RecordPreset, today: string): DateRange {
  dateMs(today);
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const startOfWeek = shiftDay(today, -((new Date(dateMs(today)).getUTCDay() + 6) % 7));
  switch (preset) {
    case "today": return { from: today, to: today };
    case "yesterday": {
      const yesterday = shiftDay(today, -1);
      return { from: yesterday, to: yesterday };
    }
    case "week": return { from: startOfWeek, to: today };
    case "month": return { from: monthStart(today), to: today };
    case "quarter": return {
      from: `${year}-${String(1 + Math.floor((month - 1) / 3) * 3).padStart(2, "0")}-01`, to: today,
    };
    case "year": return { from: `${year}-01-01`, to: today };
    case "last7": return { from: shiftDay(today, -6), to: today };
    case "last30": return { from: shiftDay(today, -29), to: today };
    case "last365": return { from: shiftDay(today, -364), to: today };
    case "last12months": return { from: shiftDay(shiftMonth(today, -12), 1), to: today };
  }
}
export function shiftDateRange(range: DateRange, direction: -1 | 1): DateRange {
  const days = Math.round((dateMs(range.to) - dateMs(range.from)) / DAY) + 1;
  return {
    from: shiftDay(range.from, direction * days),
    to: shiftDay(range.to, direction * days),
  };
}
export function monthCells(month: string): { date: string; inMonth: boolean }[] {
  const first = monthStart(month);
  const offset = (new Date(dateMs(first)).getUTCDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, i) => {
    const date = shiftDay(first, i - offset);
    return { date, inMonth: date.slice(0, 7) === month.slice(0, 7) };
  });
}
export function prettyRange(range: DateRange): string {
  const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat("de-DE", { ...options, timeZone: "UTC" })
      .format(new Date(dateMs(iso)));
  if (range.from === range.to) return fmt(range.from, { day: "numeric", month: "short", year: "numeric" });
  return fmt(range.from, { day: "numeric", month: "short" }) + " – " +
    fmt(range.to, { day: "numeric", month: "short", year: "numeric" });
}

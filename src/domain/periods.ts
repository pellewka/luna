import { Period, periodAt, validatePeriod } from './cycle';
import { addDays, DateKey } from './dates';

export type DateRange = { start: DateKey; end: DateKey };

export function selectRangeDate(range: DateRange, date: DateKey, edge: 'start' | 'end'): DateRange {
  if (edge === 'start') return { start: date, end: date > range.end ? date : range.end };
  return date < range.start ? { start: date, end: range.start } : { ...range, end: date };
}

export function markPeriodDay(periods: Period[], date: DateKey, today: DateKey, id: string) {
  if (periodAt(periods, date)) return { periods, changed: false, error: null };
  const neighbours = periods.filter(
    (period) => period.end === addDays(date, -1) || period.start === addDays(date, 1),
  );
  const start = neighbours.reduce(
    (value, period) => (period.start < value ? period.start : value),
    date,
  );
  const end = neighbours.reduce((value, period) => (period.end > value ? period.end : value), date);
  const remaining = periods.filter((period) => !neighbours.includes(period));
  const error = validatePeriod(start, end, remaining, today);
  if (error) return { periods, changed: false, error };
  return {
    periods: [...remaining, { id: neighbours[0]?.id ?? id, start, end }],
    changed: true,
    error: null,
  };
}

export function removePeriodDay(periods: Period[], date: DateKey): Period[] {
  return periods.flatMap((period) => {
    if (date < period.start || date > period.end) return [period];
    const before = period.start < date ? [{ ...period, end: addDays(date, -1) }] : [];
    const after =
      period.end > date
        ? [{ ...period, id: `${period.id}-after-${date}`, start: addDays(date, 1) }]
        : [];
    return [...before, ...after];
  });
}

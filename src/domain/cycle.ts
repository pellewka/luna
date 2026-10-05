import { addDays, dateKey, daysBetween, inputDate, parseInputDate } from './dates';
import type { DateKey } from './dates';
import { isMedication, Medication } from './medications';
import { Certificate, isCertificate, isLabResult, LabResult } from './medical';

export * from './dates';

export type Period = { id: string; start: DateKey; end: DateKey };
export type JournalEntry = { symptoms: string[]; note: string; intensity: number };
export type UserData = {
  version: 3;
  name: string;
  cycleLength: number;
  periodLength: number;
  periods: Period[];
  medications: Medication[];
  labs: LabResult[];
  certificates: Certificate[];
  journal: Record<DateKey, JournalEntry>;
};

export function latestPeriod(periods: Period[], date: DateKey): Period | undefined {
  return periods
    .filter((period) => period.start <= date)
    .sort((first, second) => second.start.localeCompare(first.start))[0];
}
export function cycleDay(periods: Period[], date: DateKey): number | null {
  const last = latestPeriod(periods, date);
  return last ? daysBetween(last.start, date) + 1 : null;
}
export function periodAt(periods: Period[], date: DateKey): Period | undefined {
  return periods.find((period) => period.start <= date && period.end >= date);
}
export function averageCycle(periods: Period[], fallback: number): number {
  const ordered = [...periods].sort((first, second) => first.start.localeCompare(second.start));
  const intervals = ordered
    .slice(1)
    .map((period, index) => daysBetween(ordered[index].start, period.start))
    .slice(-6);
  return intervals.length
    ? Math.round(intervals.reduce((first, second) => first + second, 0) / intervals.length)
    : fallback;
}
export function nextPeriod(data: UserData): DateKey | null {
  const last = [...data.periods].sort((first, second) =>
    second.start.localeCompare(first.start),
  )[0];
  return last ? addDays(last.start, averageCycle(data.periods, data.cycleLength)) : null;
}
export function isPredicted(data: UserData, date: DateKey, today: DateKey): boolean {
  const next = nextPeriod(data);
  if (!next || date <= today || date < next) return false;
  const delta = daysBetween(next, date);
  const length = averageCycle(data.periods, data.cycleLength);
  return delta < length * 3 && delta % length < data.periodLength;
}
export function monthCells(month: DateKey): { date: DateKey; current: boolean }[] {
  const first = month.slice(0, 7) + '-01';
  const day = new Date(`${first}T12:00:00`).getDay();
  const offset = (day + 6) % 7;
  const days = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0).getDate();
  const count = Math.ceil((offset + days) / 7) * 7;
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(first, index - offset);
    return { date, current: date.slice(0, 7) === first.slice(0, 7) };
  });
}
export function shiftMonth(month: DateKey, delta: number): DateKey {
  const date = new Date(`${month.slice(0, 7)}-01T12:00:00`);
  date.setMonth(date.getMonth() + delta);
  return dateKey(date);
}
export function validatePeriod(
  start: DateKey,
  end: DateKey,
  periods: Period[],
  today: DateKey,
  editingId?: string,
): string | null {
  if (end < start) return 'Дата окончания должна быть не раньше начала.';
  if (end > today || start > today) return 'Можно отмечать только прошедшие дни и сегодня.';
  if (daysBetween(start, end) > 30)
    return 'Проверьте даты: в одной записи можно отметить до 31 дня.';
  if (
    periods.some((period) => period.id !== editingId && start <= period.end && end >= period.start)
  )
    return 'Эти даты пересекаются с другой записью. Измените существующую запись.';
  return null;
}
export function makeInitialData(): UserData {
  return {
    version: 3,
    name: '',
    cycleLength: 28,
    periodLength: 5,
    periods: [],
    medications: [],
    labs: [],
    certificates: [],
    journal: {},
  };
}
export function isUserData(value: unknown): value is UserData {
  if (!value || typeof value !== 'object') return false;
  const data = value as UserData;
  const isDateKey = (date: unknown): date is string =>
    typeof date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    parseInputDate(inputDate(date)) === date;
  return (
    data.version === 3 &&
    Array.isArray(data.labs) &&
    data.labs.every((lab) => isLabResult(lab) && lab.origin === 'manual') &&
    Array.isArray(data.certificates) &&
    data.certificates.every(isCertificate) &&
    Array.isArray(data.medications) &&
    data.medications.every(isMedication) &&
    typeof data.name === 'string' &&
    Number.isInteger(data.cycleLength) &&
    data.cycleLength >= 15 &&
    data.cycleLength <= 90 &&
    Number.isInteger(data.periodLength) &&
    data.periodLength >= 1 &&
    data.periodLength <= 31 &&
    Array.isArray(data.periods) &&
    data.periods.every(
      (period) =>
        period &&
        typeof period.id === 'string' &&
        isDateKey(period.start) &&
        isDateKey(period.end) &&
        period.end >= period.start,
    ) &&
    !!data.journal &&
    typeof data.journal === 'object' &&
    !Array.isArray(data.journal) &&
    Object.entries(data.journal).every(
      ([date, entry]) =>
        isDateKey(date) &&
        entry &&
        Array.isArray(entry.symptoms) &&
        entry.symptoms.every((symptom) => typeof symptom === 'string') &&
        typeof entry.note === 'string' &&
        [0, 1, 2, 3].includes(entry.intensity),
    )
  );
}

export function parseUserData(value: unknown): UserData | null {
  if (!value || typeof value !== 'object') return null;
  const saved = value as Record<string, unknown>;
  const withMedications = saved.version === 1 ? { ...saved, version: 2, medications: [] } : saved;
  const migrated =
    withMedications.version === 2
      ? { ...withMedications, version: 3, labs: [], certificates: [] }
      : withMedications;
  if (!isUserData(migrated)) return null;
  const { name, cycleLength, periodLength, periods, medications, labs, certificates, journal } =
    migrated;
  return {
    version: 3,
    name,
    cycleLength,
    periodLength,
    periods,
    medications,
    labs,
    certificates,
    journal,
  };
}

export type DateKey = string;

const millisecondsPerDay = 86400000;
export function dateKey(date = new Date()): DateKey {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function dateValue(key: DateKey): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}
export function addDays(key: DateKey, days: number): DateKey {
  return new Date(dateValue(key) + days * millisecondsPerDay).toISOString().slice(0, 10);
}
export function daysBetween(from: DateKey, to: DateKey): number {
  return Math.round((dateValue(to) - dateValue(from)) / millisecondsPerDay);
}
export function formatDate(
  key: DateKey,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long' },
): string {
  return new Date(`${key}T12:00:00`).toLocaleDateString('ru-RU', options);
}
export function inputDate(key: DateKey): string {
  return key.split('-').reverse().join('.');
}
export function parseInputDate(value: string): DateKey | null {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value.trim());
  if (!match) return null;
  const key = `${match[3]}-${match[2]}-${match[1]}`;
  const time = dateValue(key);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === key ? key : null;
}

import { inputDate, parseInputDate } from './dates';

export const ingredients = [
  { id: 'unknown', label: 'Другой препарат / не знаю действующее вещество' },
  { id: 'spironolactone', label: 'Спиронолактон · таблетки' },
  { id: 'risperidone', label: 'Рисперидон · таблетки' },
  { id: 'levonorgestrel_ec', label: 'Левоноргестрел · экстренная контрацепция, таблетки' },
] as const;

export type Ingredient = (typeof ingredients)[number]['id'];
export type Medication = {
  id: string;
  name: string;
  ingredient: Ingredient;
  dose: string;
  start: string;
  end?: string;
};

export function isMedication(value: unknown): value is Medication {
  if (!value || typeof value !== 'object') return false;
  const item = value as Medication;
  const validDate = (date: unknown): date is string =>
    typeof date === 'string' && parseInputDate(inputDate(date)) === date;
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    !!item.name.trim() &&
    item.name.length <= 80 &&
    typeof item.dose === 'string' &&
    item.dose.length <= 80 &&
    ingredients.some(({ id }) => id === item.ingredient) &&
    validDate(item.start) &&
    (item.end === undefined || (validDate(item.end) && item.end >= item.start))
  );
}

export function validateMedication(item: Medication, today: string): string | null {
  if (!item.name.trim()) return 'Укажите название препарата.';
  if (item.end && item.end < item.start) return 'Окончание должно быть не раньше начала.';
  if (!isMedication(item)) return 'Проверьте название и даты приёма.';
  if (item.start > today || (item.end && item.end > today)) {
    return 'Записывайте уже начатый приём. Будущую дату окончания оставьте пустой.';
  }
  return null;
}

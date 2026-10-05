import { UserData } from '../../domain/cycle';
import { addDays } from '../../domain/dates';
import { Ingredient } from '../../domain/medications';

export type DiaryContext = {
  as_of: string;
  periods: { start: string; end: string }[];
  symptoms: { date: string; symptoms: string[]; intensity: number }[];
  medications: { name: string; ingredient: Ingredient; start: string; end?: string }[];
};

// Explicit fields prevent names, free-text notes and future fields from being sent.
export function buildDiaryContext(data: UserData, today: string): DiaryContext {
  const since = addDays(today, -90);
  return {
    as_of: today,
    periods: data.periods
      .filter(({ end }) => end <= today)
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 7)
      .map(({ start, end }) => ({ start, end })),
    symptoms: Object.entries(data.journal)
      .filter(([date]) => date >= since && date <= today)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 30)
      .map(([date, entry]) => ({
        date,
        symptoms: entry.symptoms.slice(0, 12).map((name) => name.slice(0, 80)),
        intensity: entry.intensity,
      })),
    medications: data.medications
      .filter(({ start, end }) => start <= today && (!end || end >= since))
      .sort((a, b) => b.start.localeCompare(a.start))
      .slice(0, 20)
      .map(({ name, ingredient, start, end }) => ({
        name,
        ingredient,
        start,
        ...(end ? { end } : {}),
      })),
  };
}

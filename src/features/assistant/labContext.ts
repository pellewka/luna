import { UserData } from '../../domain/cycle';
import { addDays } from '../../domain/dates';
import { LabCategory } from '../../domain/medical';

export type LabContext = {
  as_of: string;
  results: {
    title: string;
    date: string;
    value: string;
    unit: string;
    reference: string;
    laboratory: string;
    category: LabCategory;
    origin: 'manual';
  }[];
};

export function buildLabContext(data: UserData, today: string): LabContext {
  const earliestDate = addDays(today, -365);
  return {
    as_of: today,
    results: data.labs
      .filter(({ origin, date }) => origin === 'manual' && date >= earliestDate && date <= today)
      .sort((first, second) => second.date.localeCompare(first.date))
      .slice(0, 30)
      .map(({ title, date, value, unit, reference, laboratory, category }) => ({
        title,
        date,
        value,
        unit,
        reference,
        laboratory: laboratory || '',
        category,
        origin: 'manual',
      })),
  };
}

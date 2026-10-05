import { addDays, inputDate, parseInputDate } from './dates';

export type Attachment = { fileKey: string; name: string; mimeType: string; size: number };
export type LabCategory = 'hormones' | 'general' | 'biochemistry' | 'other';
export type LabResult = {
  id: string;
  title: string;
  date: string;
  value: string;
  unit: string;
  reference: string;
  laboratory?: string;
  category: LabCategory;
  origin: 'manual' | 'demo';
  attachment?: Attachment;
};
export type Certificate = {
  id: string;
  title: string;
  date: string;
  clinic: string;
  note: string;
  attachment?: Attachment;
};

export const labCategories: { id: LabCategory; label: string }[] = [
  { id: 'hormones', label: 'Гормоны' },
  { id: 'general', label: 'Общий анализ' },
  { id: 'biochemistry', label: 'Биохимия' },
  { id: 'other', label: 'Другое' },
];
export const labTemplates: { title: string; unit: string; category: LabCategory }[] = [
  { title: 'ТТГ', unit: 'мМЕ/л', category: 'hormones' },
  { title: 'Пролактин', unit: 'мМЕ/л', category: 'hormones' },
  { title: 'ФСГ', unit: 'МЕ/л', category: 'hormones' },
  { title: 'Гемоглобин', unit: 'г/л', category: 'general' },
  { title: 'Витамин D', unit: 'нг/мл', category: 'biochemistry' },
  { title: 'Ферритин', unit: 'нг/мл', category: 'biochemistry' },
  { title: 'Прогестерон', unit: 'нмоль/л', category: 'hormones' },
];

function isValidDateString(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    parseInputDate(inputDate(value)) === value
  );
}
function isBoundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}
export function isAttachment(value: unknown): value is Attachment {
  if (!value || typeof value !== 'object') return false;
  const item = value as Attachment;
  return (
    isBoundedText(item.fileKey, 120) &&
    /^luna-[a-z0-9-]+\.[a-z0-9]+$/.test(item.fileKey) &&
    isBoundedText(item.name, 200) &&
    isBoundedText(item.mimeType, 100) &&
    Number.isFinite(item.size) &&
    item.size > 0
  );
}
export function isLabResult(value: unknown): value is LabResult {
  if (!value || typeof value !== 'object') return false;
  const item = value as LabResult;
  return (
    isBoundedText(item.id, 100) &&
    isBoundedText(item.title, 80) &&
    !!item.title.trim() &&
    isValidDateString(item.date) &&
    isBoundedText(item.value, 80) &&
    !!item.value.trim() &&
    isBoundedText(item.unit, 30) &&
    isBoundedText(item.reference, 100) &&
    (item.laboratory === undefined || isBoundedText(item.laboratory, 80)) &&
    labCategories.some(({ id }) => id === item.category) &&
    ['manual', 'demo'].includes(item.origin) &&
    (!item.attachment || isAttachment(item.attachment))
  );
}
export function isCertificate(value: unknown): value is Certificate {
  if (!value || typeof value !== 'object') return false;
  const item = value as Certificate;
  return (
    isBoundedText(item.id, 100) &&
    isBoundedText(item.title, 100) &&
    !!item.title.trim() &&
    isValidDateString(item.date) &&
    isBoundedText(item.clinic, 100) &&
    isBoundedText(item.note, 1000) &&
    (!item.attachment || isAttachment(item.attachment))
  );
}
export function makeDemoLabs(today: string, random = Math.random): LabResult[] {
  const values = [
    () => (1 + random() * 2.5).toFixed(2),
    () => String(Math.round(180 + random() * 220)),
    () => (4 + random() * 5).toFixed(1),
    () => String(Math.round(115 + random() * 30)),
    () => (20 + random() * 25).toFixed(1),
  ];
  return values.map((createValue, index) => ({
    ...labTemplates[index],
    id: `demo-${index}`,
    origin: 'demo',
    date: addDays(today, -3 - index),
    value: createValue(),
    reference: '',
  }));
}

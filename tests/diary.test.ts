import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, makeInitialData, parseUserData } from '../src/domain/cycle';
import { Medication, validateMedication } from '../src/domain/medications';
import { askAssistant } from '../src/features/assistant/api';
import { buildDiaryContext } from '../src/features/assistant/diaryContext';

const medication: Medication = {
  id: 'm1',
  name: 'Спиронолактон',
  ingredient: 'spironolactone',
  dose: 'личная схема',
  start: '2026-09-10',
};

test('v1 diary migrates without losing periods, symptoms or notes', () => {
  const current = makeInitialData();
  const { medications: _, ...old } = current;
  const legacy = {
    ...old,
    version: 1,
    name: 'Олег',
    demoAccount: true,
    periods: [{ id: 'p', start: '2026-09-01', end: '2026-09-05' }],
    journal: { '2026-09-02': { symptoms: ['Усталость'], intensity: 2, note: 'Личная заметка' } },
  };
  const migrated = parseUserData(legacy);
  assert.ok(migrated);
  assert.equal(migrated.version, 3);
  assert.deepEqual(migrated.medications, []);
  assert.deepEqual(migrated.periods, legacy.periods);
  assert.deepEqual(migrated.journal, legacy.journal);
  assert.equal(migrated.name, legacy.name);
  assert.equal('demoAccount' in migrated, false);
  assert.equal(parseUserData({ version: 1, journal: 'broken' }), null);
});

test('medication entries reject reversed and future dates', () => {
  assert.equal(validateMedication(medication, '2026-10-05'), null);
  assert.match(
    validateMedication({ ...medication, end: '2026-09-01' }, '2026-10-05')!,
    /Окончание/,
  );
  assert.match(
    validateMedication({ ...medication, start: '2026-10-06' }, '2026-10-05')!,
    /начатый/,
  );
  assert.match(validateMedication({ ...medication, name: ' ' }, '2026-10-05')!, /название/);
});

test('shared context excludes name, notes and dose and bounds the history', () => {
  const today = '2026-10-05';
  const data = {
    ...makeInitialData(),
    name: 'private-person',
    periods: Array.from({ length: 9 }, (_, i) => ({
      id: `p${i}`,
      start: addDays(today, -i * 28),
      end: addDays(today, -i * 28),
    })),
    journal: Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [
        addDays(today, -i),
        { symptoms: ['Усталость'], intensity: 1, note: 'private-note' },
      ]),
    ),
    medications: [
      medication,
      { ...medication, id: 'old', name: 'old-drug', start: '2025-01-01', end: '2025-02-01' },
    ],
  };
  const context = buildDiaryContext(data, today);
  const encoded = JSON.stringify(context);
  assert.equal(context.periods.length, 7);
  assert.equal(context.symptoms.length, 30);
  assert.equal(context.medications.length, 1);
  for (const excluded of ['private-person', 'private-note', 'личная схема', 'old-drug']) {
    assert.equal(encoded.includes(excluded), false);
  }
  assert.equal(context.medications[0].ingredient, 'spironolactone');
  assert.equal(data.periods.length, 9);
});

test('HTTP payload shares diary only when explicitly provided', async (t) => {
  const payloads: Record<string, unknown>[] = [];
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    payloads.push(JSON.parse(String(options.body)));
    return new Response(
      JSON.stringify({ answer: 'Справка', sources: [], mode: 'reference', diary_used: false }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  });
  const connection = { baseUrl: 'http://127.0.0.1:8001', token: '' };
  const signal = new AbortController().signal;
  await askAssistant(connection, 'Что такое цикл?', [], signal);
  assert.equal('diary' in payloads[0], false);
  assert.equal('diary_consent' in payloads[0], false);
  const diary = buildDiaryContext(
    { ...makeInitialData(), medications: [medication] },
    '2026-10-05',
  );
  await askAssistant(connection, 'Разбери дневник', [], signal, diary);
  assert.deepEqual(payloads[1].diary, diary);
  assert.equal(payloads[1].diary_consent, true);
});

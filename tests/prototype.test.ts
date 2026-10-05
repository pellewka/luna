import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  cycleDay,
  isUserData,
  makeInitialData,
  parseUserData,
  validatePeriod,
} from '../src/domain/cycle';
import {
  isAttachment,
  isCertificate,
  isLabResult,
  LabResult,
  makeDemoLabs,
} from '../src/domain/medical';
import { markPeriodDay, removePeriodDay, selectRangeDate } from '../src/domain/periods';
import { buildDiaryContext } from '../src/features/assistant/diaryContext';

const today = '2026-10-05';

test('quick mark starts today, is idempotent and extends consecutive days', () => {
  const first = markPeriodDay([], today, today, 'first');
  assert.equal(first.changed, true);
  assert.equal(cycleDay(first.periods, today), 1);
  const duplicate = markPeriodDay(first.periods, today, today, 'second');
  assert.equal(duplicate.changed, false);
  assert.equal(duplicate.periods, first.periods);
  const extended = markPeriodDay(first.periods, '2026-10-06', '2026-10-06', 'third');
  assert.deepEqual(extended.periods, [{ id: 'first', start: today, end: '2026-10-06' }]);
  assert.equal(cycleDay(extended.periods, '2026-10-06'), 2);
  assert.deepEqual(removePeriodDay(extended.periods, '2026-10-06'), first.periods);
});

test('quick mark never silently fills missed days or records the future', () => {
  const before = [{ id: 'old', start: '2026-10-01', end: '2026-10-02' }];
  const result = markPeriodDay(before, today, today, 'new');
  assert.equal(result.periods.length, 2);
  assert.equal(result.periods[0].end, '2026-10-02');
  assert.ok(markPeriodDay(before, '2026-10-06', today, 'future').error);
  assert.deepEqual(removePeriodDay(result.periods, today), before);
});

test('one-day bridge merges adjacent ranges and undo preserves surrounding days', () => {
  const before = [
    { id: 'a', start: '2026-10-01', end: '2026-10-02' },
    { id: 'b', start: '2026-10-04', end: '2026-10-05' },
  ];
  const result = markPeriodDay(before, '2026-10-03', today, 'unused');
  assert.deepEqual(result.periods, [{ id: 'a', start: '2026-10-01', end: today }]);
  assert.deepEqual(
    removePeriodDay(result.periods, '2026-10-03').map(({ start, end }) => ({ start, end })),
    before.map(({ start, end }) => ({ start, end })),
  );
});

test('calendar range selection works across months and rejects conflicting records', () => {
  const first = selectRangeDate({ start: today, end: today }, '2026-09-29', 'start');
  const range = selectRangeDate(first, '2026-10-03', 'end');
  assert.deepEqual(range, { start: '2026-09-29', end: '2026-10-03' });
  assert.equal(validatePeriod(range.start, range.end, [], today), null);
  assert.deepEqual(selectRangeDate({ start: today, end: today }, '2026-10-01', 'end'), {
    start: '2026-10-01',
    end: today,
  });
  const existing = [{ id: 'a', ...range }];
  assert.ok(validatePeriod(range.start, range.end, existing, today));
  assert.equal(validatePeriod(range.start, range.end, existing, today, 'a'), null);
});

const manual: LabResult = {
  id: 'lab',
  title: 'Мой анализ',
  date: today,
  value: 'Отрицательно',
  unit: '',
  reference: '',
  category: 'other',
  origin: 'manual',
};

test('v2 migration preserves diary and medications; v3 restores added documents', () => {
  const medication = { id: 'm', name: 'Препарат', ingredient: 'unknown', dose: '', start: today };
  const legacy = {
    ...makeInitialData(),
    version: 2,
    labs: undefined,
    certificates: undefined,
    medications: [medication],
  };
  const upgraded = parseUserData(legacy);
  assert.ok(upgraded);
  assert.deepEqual(upgraded.medications, [medication]);
  assert.deepEqual(upgraded.labs, []);
  const complete = {
    ...upgraded,
    labs: [manual],
    certificates: [{ id: 'c', title: 'Справка', date: today, clinic: '', note: '' }],
  };
  assert.deepEqual(parseUserData(JSON.parse(JSON.stringify(complete))), complete);
  assert.equal(parseUserData({ ...complete, labs: [{ ...manual, value: '' }] }), null);
});

test('demo labs are variable, visibly tagged and cannot enter persisted patient records or AI context', () => {
  const first = makeDemoLabs(today, () => 0);
  const second = makeDemoLabs(today, () => 0.9);
  assert.equal(first.length, 5);
  assert.ok(first.every((record) => record.origin === 'demo' && isLabResult(record)));
  assert.notDeepEqual(
    first.map(({ value }) => value),
    second.map(({ value }) => value),
  );
  assert.equal(isUserData({ ...makeInitialData(), labs: first }), false);
  const withDocuments = {
    ...makeInitialData(),
    labs: [manual],
    certificates: [
      {
        id: 'private-document',
        title: 'private-certificate',
        date: today,
        clinic: '',
        note: 'private-note',
      },
    ],
  };
  const context = JSON.stringify(buildDiaryContext(withDocuments, today));
  assert.equal(context.includes('Мой анализ'), false);
  assert.equal(context.includes('private'), false);
});

test('medical records accept text results and reject malformed attachments and dates', () => {
  assert.ok(isLabResult(manual));
  assert.equal(isLabResult({ ...manual, date: '2026-02-30' }), false);
  const attachment = {
    fileKey: 'luna-123-abc.pdf',
    name: 'Справка.pdf',
    mimeType: 'application/pdf',
    size: 500,
  };
  assert.ok(isAttachment(attachment));
  assert.equal(isAttachment({ ...attachment, fileKey: '../../secret.pdf' }), false);
  assert.ok(
    isCertificate({ id: 'c', title: 'Справка', date: today, clinic: '', note: '', attachment }),
  );
});

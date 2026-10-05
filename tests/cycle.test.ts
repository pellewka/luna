import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays,
  averageCycle,
  cycleDay,
  daysBetween,
  inputDate,
  isPredicted,
  isUserData,
  makeInitialData,
  monthCells,
  nextPeriod,
  parseInputDate,
  periodAt,
  shiftMonth,
  validatePeriod,
} from '../src/domain/cycle';

test('calendar arithmetic survives leap years, month boundaries and DST', () => {
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(daysBetween('2026-03-07', '2026-03-10'), 3);
  assert.equal(addDays('2026-03-09', -2), '2026-03-07');
});
test('cycle day uses latest observed start, never silently wraps at expected length', () => {
  const data = cycleFixture();
  assert.equal(cycleDay(data.periods, '2026-10-04'), 5);
  assert.equal(cycleDay(data.periods, '2026-09-30'), 1);
  assert.equal(cycleDay(data.periods, '2026-11-10'), 42);
  assert.equal(cycleDay([], '2026-10-04'), null);
  assert.equal(cycleDay(data.periods, '2026-01-01'), null);
});
test('confirmed dates are inclusive, predictions are future-only', () => {
  const data = cycleFixture();
  assert.ok(periodAt(data.periods, '2026-09-30'));
  assert.ok(periodAt(data.periods, '2026-10-04'));
  assert.equal(periodAt(data.periods, '2026-10-05'), undefined);
  assert.equal(nextPeriod(data), '2026-10-28');
  assert.ok(isPredicted(data, '2026-10-28', '2026-10-04'));
  assert.ok(isPredicted(data, '2026-11-01', '2026-10-04'));
  assert.equal(isPredicted(data, '2026-11-02', '2026-10-04'), false);
  assert.equal(isPredicted(data, '2026-10-28', '2026-10-29'), false);
});
test('interval calculation sorts periods and falls back only without history', () => {
  const periods = [
    { id: '1', start: '2026-01-01', end: '2026-01-05' },
    { id: '3', start: '2026-02-28', end: '2026-03-04' },
    { id: '2', start: '2026-01-29', end: '2026-02-02' },
  ];
  assert.equal(averageCycle(periods, 26), 29);
  assert.equal(averageCycle([], 26), 26);
  assert.equal(periods[1].id, '3'); // does not mutate inputs
});
test('date form rejects impossible days and preserves canonical dates', () => {
  assert.equal(parseInputDate('29.02.2026'), null);
  assert.equal(parseInputDate('31.04.2026'), null);
  assert.equal(parseInputDate('04.13.2026'), null);
  assert.equal(parseInputDate('29.02.2024'), '2024-02-29');
  assert.equal(parseInputDate(inputDate('2026-10-04')), '2026-10-04');
});
test('period edits prevent inverted, future and overlapping ranges', () => {
  const data = cycleFixture();
  assert.match(validatePeriod('2026-10-04', '2026-10-01', [], '2026-10-04')!, /окончания/);
  assert.match(validatePeriod('2026-10-05', '2026-10-05', [], '2026-10-04')!, /прошедшие/);
  assert.match(
    validatePeriod('2026-09-30', '2026-10-01', data.periods, '2026-10-04')!,
    /пересекаются/,
  );
  assert.equal(
    validatePeriod('2026-09-30', '2026-10-03', data.periods, '2026-10-04', 'sample-0'),
    null,
  );
});
test('month grid begins on Monday with consistent real dates', () => {
  const cells = monthCells('2026-10-01');
  assert.equal(cells[0].date, '2026-09-28');
  assert.equal(cells.filter((c) => c.current).length, 31);
  assert.equal(cells.length % 7, 0);
  assert.equal(shiftMonth('2026-12-01', 1), '2027-01-01');
  assert.equal(shiftMonth('2026-01-31', -1), '2025-12-01');
});
test('persisted state validator rejects corrupt and legacy structures', () => {
  assert.ok(isUserData(makeInitialData()));
  assert.equal(isUserData({ version: 1 }), false);
  assert.equal(isUserData(null), false);
  assert.equal(isUserData({ ...makeInitialData(), cycleLength: -1 }), false);
  assert.equal(isUserData({ ...makeInitialData(), journal: { 'not-a-date': {} } }), false);
});

function cycleFixture() {
  return {
    ...makeInitialData(),
    periods: [0, 28, 56].map((offset, index) => ({
      id: 'sample-' + index,
      start: addDays('2026-09-30', -offset),
      end: addDays('2026-10-04', -offset),
    })),
  };
}

test('new installation starts empty and accepts existing v1 diary data', () => {
  assert.deepEqual(makeInitialData().periods, []);
  assert.deepEqual(makeInitialData().journal, {});
  assert.ok(isUserData({ ...cycleFixture(), demoAccount: true }));
});

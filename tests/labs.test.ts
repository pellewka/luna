import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addDays, makeInitialData, parseUserData } from '../src/domain/cycle';
import { LabResult } from '../src/domain/medical';
import { askAssistant, checkServer } from '../src/features/assistant/api';
import { buildLabContext } from '../src/features/assistant/labContext';

const today = '2026-10-05';
const lab: LabResult = {
  id: 'lab',
  title: 'Ферритин',
  date: today,
  value: '12,5',
  unit: 'нг/мл',
  reference: '15–100',
  category: 'biochemistry',
  laboratory: 'Лаборатория А',
  origin: 'manual',
  attachment: {
    fileKey: 'luna-private.pdf',
    name: 'private-file.pdf',
    mimeType: 'application/pdf',
    size: 100,
  },
};

test('lab context includes only recent manual fields and never files or personal metadata', () => {
  const data = {
    ...makeInitialData(),
    name: 'private-name',
    labs: [
      lab,
      { ...lab, id: 'old', date: '2025-10-04' },
      { ...lab, id: 'future', date: '2026-10-06' },
      { ...lab, id: 'demo', origin: 'demo' as const },
    ],
  };
  const context = buildLabContext(data, today);
  assert.equal(context.results.length, 1);
  assert.equal(context.results[0].laboratory, 'Лаборатория А');
  const encoded = JSON.stringify(context);
  for (const excluded of ['private', 'attachment', 'fileKey', 'demo', '2025-10-04', '2026-10-06']) {
    assert.equal(encoded.includes(excluded), false);
  }
  assert.equal(data.labs.length, 4);
});

test('lab context is limited to thirty newest entries and supports older records without laboratory', () => {
  const data = {
    ...makeInitialData(),
    labs: Array.from({ length: 40 }, (_, index) => ({
      ...lab,
      id: String(index),
      date: addDays(today, -index),
      laboratory: undefined,
    })).reverse(),
  };
  const context = buildLabContext(data, today);
  assert.equal(context.results.length, 30);
  assert.equal(context.results[0].date, today);
  assert.equal(context.results[0].laboratory, '');
  assert.ok(parseUserData(data));
});

test('lab consent is independent of diary and old server responses are rejected for lab requests', async (t) => {
  const payloads: Record<string, unknown>[] = [];
  let oldServer = false;
  t.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    payloads.push(JSON.parse(String(options.body)));
    return new Response(
      JSON.stringify({
        answer: 'Сводка',
        sources: [],
        mode: 'reference',
        diary_used: false,
        ...(oldServer ? {} : { labs_used: true }),
      }),
      { status: 200 },
    );
  });
  const connection = { baseUrl: 'http://127.0.0.1:8001', token: '' };
  const signal = new AbortController().signal;
  const context = buildLabContext({ ...makeInitialData(), labs: [lab] }, today);
  await askAssistant(connection, 'Объясни анализы', [], signal);
  assert.equal('labs' in payloads[0], false);
  await askAssistant(connection, 'Объясни анализы', [], signal, undefined, context);
  assert.equal(payloads[1].labs_consent, true);
  assert.deepEqual(payloads[1].labs, context);
  assert.equal('diary' in payloads[1], false);
  oldServer = true;
  await assert.rejects(
    askAssistant(connection, 'Объясни анализы', [], signal, undefined, context),
    /Несовместимая/,
  );
});

test('connection check distinguishes available backend from missing generation model', async (t) => {
  t.mock.method(
    globalThis,
    'fetch',
    async () =>
      new Response(
        JSON.stringify({
          status: 'ok',
          features: ['diary', 'labs'],
          knowledge: { articles: 100 },
          model: { state: 'missing', message: 'Модель не скачана' },
        }),
        { status: 200 },
      ),
  );
  const result = await checkServer(
    { baseUrl: 'http://127.0.0.1:8001', token: '' },
    new AbortController().signal,
  );
  assert.equal(result.model.state, 'missing');
  assert.equal(result.articles, 100);
});

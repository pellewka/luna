import { AssistantReply, Connection, HistoryMessage, ServerStatus } from './types';
import { DiaryContext } from './diaryContext';
import { LabContext } from './labContext';

export function normalizeServerUrl(value: string): string {
  const url = new URL(value.trim());
  const isLocal =
    /^(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)$/.test(
      url.hostname,
    );
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    throw new Error('Используйте HTTPS. HTTP разрешён только для локального сервера.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('Укажите только адрес сервера и порт, например http://127.0.0.1:8001');
  }
  return url.origin;
}

async function request(connection: Connection, path: string, signal: AbortSignal, body?: object) {
  const response = await fetch(normalizeServerUrl(connection.baseUrl) + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(connection.token ? { Authorization: 'Bearer ' + connection.token } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal,
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Проверьте ключ подключения в настройках помощника.',
      403: 'Сервер не разрешил подключение. Проверьте сетевой доступ и ключ.',
      413: 'Слишком много данных. Сократите вопрос или временно отключите один из разделов.',
      422: 'Проверьте вопрос, даты в дневнике и анализах: сервер не принял данные.',
      429: 'Слишком много запросов. Повторите через минуту.',
      503: 'Помощник занят. Попробуйте немного позже.',
    };
    throw new Error(
      messages[response.status] || 'Сервер не смог обработать запрос. Попробуйте ещё раз.',
    );
  }
  return response.json();
}

export async function askAssistant(
  connection: Connection,
  message: string,
  history: HistoryMessage[],
  signal: AbortSignal,
  diary?: DiaryContext,
  labs?: LabContext,
): Promise<AssistantReply> {
  const result = await request(connection, '/v1/chat', signal, {
    message,
    history,
    ...(diary ? { diary, diary_consent: true } : {}),
    ...(labs ? { labs, labs_consent: true } : {}),
  });
  if (
    typeof result.answer !== 'string' ||
    typeof result.diary_used !== 'boolean' ||
    (labs !== undefined && typeof result.labs_used !== 'boolean') ||
    !Array.isArray(result.sources) ||
    !['llm', 'reference', 'safety', 'no_evidence'].includes(result.mode)
  ) {
    throw new Error(
      'Несовместимая версия сервера. Перезапустите сервер из обновлённой папки проекта.',
    );
  }
  result.labs_used = result.labs_used === true;
  // Source links never come from generated Markdown or arbitrary model URLs.
  result.sources = result.sources.filter((source: unknown) => {
    if (!source || typeof source !== 'object') return false;
    const item = source as Record<string, unknown>;
    if (
      typeof item.url !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.id !== 'string' ||
      typeof item.publisher !== 'string' ||
      typeof item.checked_at !== 'string'
    )
      return false;
    try {
      const url = new URL(item.url);
      return (
        url.protocol === 'https:' &&
        ['womenshealth.gov', 'medlineplus.gov', 'www.nhs.uk', 'dailymed.nlm.nih.gov'].includes(
          url.hostname,
        )
      );
    } catch {
      return false;
    }
  });
  return result;
}

export async function checkServer(
  connection: Connection,
  signal: AbortSignal,
): Promise<ServerStatus> {
  const result = await request(connection, '/health', signal);
  if (result.status !== 'ok' || !Number.isInteger(result.knowledge?.articles))
    throw new Error('По этому адресу нет сервера «Луны».');
  if (
    !Array.isArray(result.features) ||
    !['diary', 'labs'].every((feature) => result.features.includes(feature))
  ) {
    throw new Error(
      'Этот сервер ещё не поддерживает анализы. Перезапустите его из обновлённой папки проекта.',
    );
  }
  if (
    !['ready', 'missing', 'unreachable', 'disabled'].includes(result.model?.state) ||
    typeof result.model?.message !== 'string'
  ) {
    throw new Error('Сервер не сообщил состояние модели. Обновите сервер приложения.');
  }
  return { articles: result.knowledge.articles, model: result.model };
}

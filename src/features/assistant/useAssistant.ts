import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { UserData } from '../../domain/cycle';
import { askAssistant } from './api';
import { readConnection, saveConnection } from './connectionStore';
import { buildDiaryContext } from './diaryContext';
import { buildLabContext } from './labContext';
import { ChatMessage, Connection } from './types';

const defaultUrl =
  process.env.EXPO_PUBLIC_API_URL ||
  (Platform.OS === 'android' ? 'http://10.0.2.2:8001' : 'http://127.0.0.1:8001');

export function useAssistant(data: UserData, today: string) {
  const [connection, setConnection] = useState<Connection>({ baseUrl: defaultUrl, token: '' });
  const [ready, setReady] = useState(false);
  const [diaryEnabled, setDiaryEnabled] = useState(false);
  const [labsEnabled, setLabsEnabled] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failedMessage, setFailedMessage] = useState('');
  const activeRequest = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);
  const sharedData = useMemo(
    () => ({
      diary: diaryEnabled ? buildDiaryContext(data, today) : undefined,
      labs: labsEnabled ? buildLabContext(data, today) : undefined,
    }),
    [data, today, diaryEnabled, labsEnabled],
  );
  const contextSignature = JSON.stringify(sharedData);
  const previousContext = useRef(contextSignature);

  const clear = useCallback(() => {
    requestSequence.current += 1;
    activeRequest.current?.abort();
    activeRequest.current = null;
    setMessages([]);
    setBusy(false);
    setError('');
    setFailedMessage('');
  }, []);

  useEffect(() => {
    if (previousContext.current !== contextSignature) {
      previousContext.current = contextSignature;
      clear();
    }
  }, [contextSignature, clear]);

  useEffect(() => {
    let mounted = true;
    readConnection()
      .then((saved) => {
        if (mounted && saved) setConnection(saved);
      })
      .catch(() => {
        if (mounted) setError('Не удалось прочитать подключение. Проверьте настройки помощника.');
      })
      .finally(() => {
        if (mounted) setReady(true);
      });
    return () => {
      mounted = false;
      activeRequest.current?.abort();
    };
  }, []);

  async function send(text: string, retry = false) {
    const message = text.trim();
    if (!ready || !message || message.length > 2000 || activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    const requestId = ++requestSequence.current;
    const contextUnchanged = previousContext.current === contextSignature;
    const conversation = contextUnchanged ? messages : [];
    const history = (retry ? conversation.slice(0, -1) : conversation)
      .slice(-6)
      .map(({ role, content }) => ({ role, content: content.slice(0, 3000) }));
    if (!retry)
      setMessages((current) => [
        ...(contextUnchanged ? current : []),
        { id: 'user-' + requestId, role: 'user', content: message },
      ]);
    setBusy(true);
    setError('');
    setFailedMessage('');
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 120000);
    try {
      const reply = await askAssistant(
        connection,
        message,
        history,
        controller.signal,
        sharedData.diary,
        sharedData.labs,
      );
      if (requestId !== requestSequence.current) return;
      setMessages((current) => [
        ...current,
        { id: 'assistant-' + requestId, role: 'assistant', content: reply.answer, reply },
      ]);
    } catch (failure) {
      if (requestId !== requestSequence.current) return;
      const detail = failure instanceof Error ? failure.message : '';
      const networkError = !detail || /fetch|network|abort|load failed/i.test(detail);
      setError(
        timedOut
          ? 'Ответ занимает слишком много времени. Проверьте модель в настройках помощника.'
          : networkError
            ? 'Помощник недоступен. Проверьте подключение и запуск сервера.'
            : detail,
      );
      setFailedMessage(message);
    } finally {
      clearTimeout(timeout);
      if (requestId === requestSequence.current) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  function allowDiary(enabled: boolean) {
    clear();
    setDiaryEnabled(enabled);
  }

  function allowLabs(enabled: boolean) {
    clear();
    setLabsEnabled(enabled);
  }

  function resetAccess() {
    clear();
    setDiaryEnabled(false);
    setLabsEnabled(false);
  }

  async function updateConnection(next: Connection) {
    try {
      await saveConnection(next);
    } catch {
      throw new Error('Не удалось сохранить подключение на устройстве.');
    }
    if (next.baseUrl !== connection.baseUrl || next.token !== connection.token) resetAccess();
    setConnection(next);
  }

  return {
    connection,
    updateConnection,
    ready,
    diaryEnabled,
    allowDiary,
    labsEnabled,
    allowLabs,
    resetAccess,
    messages,
    busy,
    error,
    failedMessage,
    send,
    clear,
  };
}

export type AssistantController = ReturnType<typeof useAssistant>;

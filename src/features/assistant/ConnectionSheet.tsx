import { useEffect, useRef, useState } from 'react';
import { TextInput } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Button, AppText, commonStyles } from '../../components/ui';
import { colors } from '../../theme';
import { checkServer, normalizeServerUrl } from './api';
import { Connection } from './types';

type Props = {
  connection: Connection;
  onSave: (connection: Connection) => Promise<void>;
  onClose: () => void;
};

export function ConnectionSheet({ connection, onSave, onClose }: Props) {
  const [baseUrl, setBaseUrl] = useState(connection.baseUrl);
  const [token, setToken] = useState(connection.token);
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);
  useEffect(() => () => activeRequest.current?.abort(), []);

  function connectionFromForm() {
    return { baseUrl: normalizeServerUrl(baseUrl), token: token.trim() };
  }

  async function checkConnection() {
    setChecking(true);
    setStatus('');
    const controller = new AbortController();
    activeRequest.current = controller;
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const result = await checkServer(connectionFromForm(), controller.signal);
      setStatus(
        'Сервер доступен. Поисковых фрагментов в базе: ' +
          result.articles +
          '. ' +
          result.model.message,
      );
    } catch (failure) {
      const detail = failure instanceof Error ? failure.message : '';
      setStatus(
        /fetch|network|abort|load failed/i.test(detail)
          ? 'Не удалось подключиться. Проверьте адрес и запуск сервера.'
          : detail,
      );
    } finally {
      clearTimeout(timeout);
      setChecking(false);
    }
  }

  return (
    <Sheet title="Подключение помощника" onClose={onClose}>
      <AppText muted style={{ lineHeight: 21 }}>
        Вопросы и разрешённые записи дневника и анализов отправляются на этот сервер.
      </AppText>
      <AppText style={commonStyles.label}>Адрес сервера</AppText>
      <TextInput
        accessibilityLabel="Адрес сервера"
        value={baseUrl}
        onChangeText={setBaseUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        maxLength={200}
        style={commonStyles.input}
      />
      <AppText style={commonStyles.label}>Ключ подключения, если задан на сервере</AppText>
      <TextInput
        accessibilityLabel="Ключ подключения"
        value={token}
        onChangeText={setToken}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        maxLength={256}
        style={commonStyles.input}
      />
      {!!status && (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ marginTop: 16, lineHeight: 20, color: colors.purpleDark }}
        >
          {status}
        </AppText>
      )}
      <Button
        title={checking ? 'Проверяем…' : 'Проверить подключение'}
        secondary
        disabled={checking}
        onPress={checkConnection}
        style={{ marginTop: 18 }}
      />
      <Button
        title="Сохранить подключение"
        disabled={checking}
        onPress={async () => {
          setChecking(true);
          try {
            await onSave(connectionFromForm());
            onClose();
          } catch (failure) {
            setStatus(failure instanceof Error ? failure.message : 'Проверьте адрес.');
          } finally {
            setChecking(false);
          }
        }}
        style={{ marginTop: 10 }}
      />
    </Sheet>
  );
}

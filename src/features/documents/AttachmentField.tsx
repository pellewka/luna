import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { Button, AppText } from '../../components/ui';
import { colors } from '../../theme';
import { AttachmentDraft, attachmentUri, pickAttachment, shareAttachment } from './files';

export function AttachmentField({
  value,
  onChange,
}: {
  value?: AttachmentDraft;
  onChange: (value?: AttachmentDraft) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function pick() {
    setBusy(true);
    setError('');
    try {
      const next = await pickAttachment();
      if (next) onChange(next);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Не удалось выбрать файл.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <View style={styles.container}>
      {value && (
        <>
          {value.mimeType.startsWith('image/') && (
            <Image
              source={{ uri: attachmentUri(value) }}
              accessibilityLabel="Прикреплённое изображение"
              resizeMode="contain"
              style={styles.preview}
            />
          )}
          <AppText style={styles.name}>{value.name}</AppText>
          <Button
            title="Открыть меню файла"
            secondary
            icon="file"
            onPress={() => {
              setError('');
              void shareAttachment(value).catch((failure) =>
                setError(failure instanceof Error ? failure.message : 'Не удалось открыть файл.'),
              );
            }}
          />
        </>
      )}
      <Button
        title={busy ? 'Выбираем…' : value ? 'Заменить файл' : 'Прикрепить PDF или фото'}
        disabled={busy}
        secondary
        icon="plus"
        onPress={() => void pick()}
      />
      {!!value && <Button title="Убрать вложение" secondary onPress={() => onChange(undefined)} />}
      {!value && (
        <AppText muted style={styles.hint}>
          Файл из приложения «Файлы», до 15 МБ. Можно сохранить и без вложения.
        </AppText>
      )}
      {!!error && (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9, marginTop: 18 },
  preview: { width: '100%', height: 180, borderRadius: 16, backgroundColor: colors.lilac },
  name: { fontSize: 13, lineHeight: 19 },
  hint: { fontSize: 11, lineHeight: 17 },
  error: { color: colors.redDark, fontSize: 13, lineHeight: 19 },
});

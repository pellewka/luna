import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Empty, Header, Icon, Screen, AppText } from '../components/ui';
import { formatDate } from '../domain/dates';
import { Certificate } from '../domain/medical';
import { CertificateEditor } from '../features/documents/CertificateEditor';
import { useApp } from '../state/AppState';
import { colors } from '../theme';

export function Certificates({
  onBack,
  notify,
  addOnOpen = false,
}: {
  onBack: () => void;
  notify: (text: string) => void;
  addOnOpen?: boolean;
}) {
  const { data } = useApp();
  const [editor, setEditor] = useState<{ certificate?: Certificate } | null>(addOnOpen ? {} : null);
  const records = [...data.certificates].sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Screen>
      <Header title="Справки" subtitle="Ваши документы под рукой" onBack={onBack} />
      <Button title="Добавить справку" icon="plus" onPress={() => setEditor({})} />
      <View style={styles.list}>
        {!records.length && (
          <Empty
            icon="file"
            title="Добавьте первую справку"
            text="Укажите название и дату. При желании прикрепите PDF или изображение."
          />
        )}
        {records.map((record) => (
          <Pressable
            key={record.id}
            accessibilityRole="button"
            accessibilityLabel={`Открыть справку: ${record.title}`}
            onPress={() => setEditor({ certificate: record })}
            style={styles.card}
          >
            <View style={styles.row}>
              <Icon name="file" size={27} />
              <View style={{ flex: 1 }}>
                <AppText style={styles.title}>{record.title}</AppText>
                <AppText muted style={styles.meta}>
                  {formatDate(record.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                </AppText>
              </View>
              <Icon name="right" size={18} />
            </View>
            {!!record.clinic && (
              <AppText muted style={styles.meta}>
                {record.clinic}
              </AppText>
            )}
            <Badge
              label={
                record.attachment
                  ? record.attachment.mimeType === 'application/pdf'
                    ? 'PDF прикреплён'
                    : 'Изображение прикреплено'
                  : 'Запись без файла'
              }
            />
          </Pressable>
        ))}
      </View>
      {editor && (
        <CertificateEditor
          certificate={editor.certificate}
          onClose={() => setEditor(null)}
          notify={notify}
        />
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  list: { gap: 12, marginTop: 18 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 12, lineHeight: 19, marginTop: 4 },
});

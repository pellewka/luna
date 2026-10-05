import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Badge, Button, Empty, Header, Icon, Notice, Screen, AppText } from '../../components/ui';
import { formatDate } from '../../domain/dates';
import { Medication } from '../../domain/medications';
import { useApp } from '../../state/AppState';
import { colors } from '../../theme';
import { MedicationEditor } from './MedicationEditor';

type Props = { onBack: () => void; onChat: () => void; notify: (text: string) => void };

export function MedicationsScreen({ onBack, onChat, notify }: Props) {
  const { data } = useApp();
  const [editor, setEditor] = useState<{ medication?: Medication } | null>(null);
  const entries = [...data.medications].sort((a, b) => b.start.localeCompare(a.start));

  return (
    <Screen>
      <Header title="Мои препараты" subtitle="Ваши записи о приёме" onBack={onBack} />
      <Button title="Добавить препарат" icon="plus" onPress={() => setEditor({})} />
      <View style={styles.list}>
        {entries.length === 0 && (
          <Empty
            icon="pill"
            title="Записей пока нет"
            text="Добавьте препарат и даты приёма, чтобы сопоставить их с дневником."
          />
        )}
        {entries.map((medication) => (
          <Pressable
            key={medication.id}
            accessibilityRole="button"
            accessibilityLabel={'Изменить приём: ' + medication.name}
            onPress={() => setEditor({ medication })}
            style={styles.card}
          >
            <View style={styles.row}>
              <View style={styles.symbol}>
                <Icon name="pill" />
              </View>
              <View style={styles.detail}>
                <AppText style={styles.name}>{medication.name}</AppText>
                {!!medication.dose && (
                  <AppText muted style={styles.caption}>
                    {medication.dose}
                  </AppText>
                )}
              </View>
              <Icon name="right" size={18} />
            </View>
            <AppText muted style={styles.caption}>
              {formatDate(medication.start)} —{' '}
              {medication.end ? formatDate(medication.end) : 'принимаю сейчас'}
            </AppText>
            <Badge
              label={
                medication.ingredient === 'unknown'
                  ? 'Нет справки в базе'
                  : 'Есть справка о влиянии на цикл'
              }
            />
          </Pressable>
        ))}
      </View>
      {entries.length > 0 && (
        <Button
          title="Обсудить с помощником"
          icon="sparkles"
          secondary
          onPress={onChat}
          style={styles.chat}
        />
      )}
      <Notice>
        Ваш журнал приёма. Даты можно обсудить с помощником после разрешения доступа к дневнику.
      </Notice>
      {editor && (
        <MedicationEditor
          medication={editor.medication}
          onClose={() => setEditor(null)}
          onSaved={notify}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: 18, gap: 12 },
  card: {
    padding: 18,
    borderRadius: 22,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  symbol: {
    width: 42,
    height: 42,
    borderRadius: 15,
    backgroundColor: colors.rose,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detail: { flex: 1 },
  name: { fontWeight: '600', fontSize: 16 },
  caption: { fontSize: 12, lineHeight: 19 },
  chat: { marginVertical: 18 },
});

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { ChoiceChips } from '../components/ChoiceChips';
import { Badge, Button, Empty, Header, Icon, Notice, Screen, AppText } from '../components/ui';
import { formatDate } from '../domain/dates';
import { labCategories, LabCategory, LabResult, makeDemoLabs } from '../domain/medical';
import { LabEditor } from '../features/documents/LabEditor';
import { useApp } from '../state/AppState';
import { colors } from '../theme';

export function Labs({
  notify,
  addOnOpen = false,
  onChat,
}: {
  notify: (message: string) => void;
  addOnOpen?: boolean;
  onChat: () => void;
}) {
  const { data, today } = useApp();
  const [source, setSource] = useState<'manual' | 'demo'>(data.labs.length ? 'manual' : 'demo');
  const [category, setCategory] = useState<LabCategory | 'all'>('all');
  const [demo, setDemo] = useState(() => makeDemoLabs(today));
  const [editor, setEditor] = useState<{ result?: LabResult } | null>(addOnOpen ? {} : null);
  const records = (source === 'demo' ? demo : data.labs)
    .filter((record) => category === 'all' || record.category === category)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <Screen>
      <Header title="Анализы" subtitle="Результаты, которые вы добавили" />
      <Button title="Добавить анализ" icon="plus" onPress={() => setEditor({})} />
      {source === 'manual' && data.labs.some((result) => result.origin === 'manual') && (
        <Button
          title="Обсудить анализы с ИИ"
          icon="sparkles"
          secondary
          onPress={onChat}
          style={{ marginTop: 10 }}
        />
      )}
      <View style={styles.filters}>
        <ChoiceChips
          options={[
            { id: 'manual', label: `Мои · ${data.labs.length}` },
            { id: 'demo', label: 'Демо' },
          ]}
          value={source}
          onChange={setSource}
        />
        <ChoiceChips
          options={[{ id: 'all', label: 'Все' }, ...labCategories]}
          value={category}
          onChange={setCategory}
        />
      </View>
      {source === 'demo' && (
        <View style={styles.demo}>
          <Notice>
            Случайные примеры для показа прототипа. Это не ваши результаты; помощник их не получает.
          </Notice>
          <Button
            compact
            secondary
            icon="refresh"
            title="Обновить примеры"
            onPress={() => setDemo(makeDemoLabs(today))}
          />
        </View>
      )}
      <View style={styles.list}>
        {records.length === 0 && (
          <Empty
            icon="lab"
            title="Здесь пока пусто"
            text="Добавьте результат вручную или выберите другой раздел."
          />
        )}
        {records.map((record) => (
          <Pressable
            key={record.id}
            accessibilityRole={source === 'manual' ? 'button' : undefined}
            disabled={source === 'demo'}
            accessibilityLabel={
              source === 'manual'
                ? `Открыть анализ: ${record.title}`
                : `${record.title}, демонстрационный результат`
            }
            onPress={() => setEditor({ result: record })}
            style={styles.card}
          >
            <View style={styles.row}>
              <View style={styles.symbol}>
                <Icon name="lab" size={24} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText style={styles.title}>{record.title}</AppText>
                <AppText muted style={styles.meta}>
                  {formatDate(record.date, { day: 'numeric', month: 'long', year: 'numeric' })}
                </AppText>
              </View>
              {source === 'manual' && <Icon name="right" size={18} />}
            </View>
            <AppText selectable style={styles.value}>
              {record.value}{' '}
              <AppText muted style={styles.unit}>
                {record.unit}
              </AppText>
            </AppText>
            {!!record.reference && (
              <AppText muted style={styles.reference}>
                Референс из бланка: {record.reference}
              </AppText>
            )}
            {!!record.laboratory && (
              <AppText muted style={styles.reference}>
                {record.laboratory}
              </AppText>
            )}
            <View style={styles.row}>
              <Badge
                label={source === 'demo' ? 'Демо · случайные данные' : 'Введено вручную'}
                background={source === 'demo' ? colors.amber : colors.green}
                color={source === 'demo' ? colors.amberDark : colors.greenDark}
              />
              {!!record.attachment && <Icon name="file" size={18} />}
            </View>
          </Pressable>
        ))}
      </View>
      {editor && (
        <LabEditor
          result={editor.result}
          onClose={() => setEditor(null)}
          notify={(message) => {
            setSource('manual');
            setCategory('all');
            notify(message);
          }}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { gap: 12, marginVertical: 18 },
  demo: { gap: 10, marginBottom: 18 },
  list: { gap: 12 },
  card: {
    padding: 18,
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    gap: 13,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  symbol: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lavender,
  },
  title: { fontSize: 16, fontWeight: '600' },
  meta: { fontSize: 11, lineHeight: 17, marginTop: 4 },
  value: { fontSize: 28, fontWeight: '500' },
  unit: { fontSize: 14, fontWeight: '400' },
  reference: { fontSize: 12, lineHeight: 19 },
});

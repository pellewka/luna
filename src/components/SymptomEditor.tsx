import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { symptomOptions } from '../constants/symptoms';
import { formatDate } from '../domain/cycle';
import { useApp } from '../state/AppState';
import { colors } from '../theme';
import { ChoiceChips } from './ChoiceChips';
import { Sheet } from './Sheet';
import { Button, Icon, TextField, AppText, commonStyles } from './ui';

const moods = new Set(['Спокойствие', 'Хорошее настроение', 'Перепады настроения']);
const groups = [
  { title: 'Ощущения', options: symptomOptions.filter(({ name }) => !moods.has(name)) },
  { title: 'Настроение', options: symptomOptions.filter(({ name }) => moods.has(name)) },
];

export function SymptomEditor({
  date,
  onClose,
  onSaved,
}: {
  date: string;
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const { data, update } = useApp();
  const existing = data.journal[date];
  const [symptoms, setSymptoms] = useState<string[]>(existing?.symptoms || []);
  const [note, setNote] = useState(existing?.note || '');
  const [showNote, setShowNote] = useState(!!existing?.note);
  const [intensity, setIntensity] = useState(existing?.intensity || 0);
  const [error, setError] = useState('');
  function save() {
    const updated = update((current) => {
      const journal = { ...current.journal };
      if (!symptoms.length && !note.trim()) delete journal[date];
      else journal[date] = { symptoms, note: note.trim(), intensity };
      return { ...current, journal };
    });
    if (!updated) {
      setError('Сначала восстановите доступ к записям.');
      return;
    }
    onSaved('Самочувствие сохранено');
    onClose();
  }
  return (
    <Sheet
      title="Как вы себя чувствуете?"
      subtitle={formatDate(date)}
      onClose={onClose}
      footer={
        <Button
          title={
            symptoms.length ? `Сохранить · ${symptoms.length} выбрано` : 'Сохранить самочувствие'
          }
          icon="check"
          onPress={save}
        />
      }
    >
      <Button
        compact
        secondary
        title="Нет симптомов"
        onPress={() => {
          setSymptoms([]);
          setIntensity(0);
        }}
      />
      {groups.map((group) => (
        <View key={group.title}>
          <AppText style={commonStyles.label}>{group.title}</AppText>
          <View style={styles.grid}>
            {group.options.map((option) => {
              const selected = symptoms.includes(option.name);
              return (
                <Pressable
                  key={option.name}
                  accessibilityRole="checkbox"
                  accessibilityLabel={option.name}
                  accessibilityState={{ checked: selected }}
                  onPress={() =>
                    setSymptoms((current) =>
                      current.includes(option.name)
                        ? current.filter((name) => name !== option.name)
                        : [...current, option.name],
                    )
                  }
                  style={[
                    styles.option,
                    selected && {
                      backgroundColor: colors[option.tone],
                      borderColor: colors.purple,
                    },
                  ]}
                >
                  <Icon name={option.icon} size={23} />
                  <AppText style={styles.label}>{option.name}</AppText>
                  {selected && <Icon name="check" size={16} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
      <AppText style={commonStyles.label}>Выраженность ощущений</AppText>
      <ChoiceChips
        options={['Не указано', 'Легко', 'Умеренно', 'Сильно'].map((label, index) => ({
          id: String(index),
          label,
        }))}
        value={String(intensity)}
        onChange={(value) => setIntensity(Number(value))}
      />
      {showNote ? (
        <TextField
          label="Заметка для себя"
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          textAlignVertical="top"
          style={{ minHeight: 100 }}
          placeholder="Что хочется запомнить?"
        />
      ) : (
        <Button
          title="Добавить заметку"
          icon="plus"
          secondary
          onPress={() => setShowNote(true)}
          style={{ marginTop: 18 }}
        />
      )}
      {!!error && (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
    </Sheet>
  );
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 74,
    padding: 12,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.white,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  label: { fontSize: 13, lineHeight: 19, flex: 1 },
  error: { color: colors.redDark, fontSize: 13, lineHeight: 20, marginTop: 15 },
});

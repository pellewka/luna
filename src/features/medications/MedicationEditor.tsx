import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Button, Icon, AppText, commonStyles } from '../../components/ui';
import { DateField } from '../../components/DateField';
import { Ingredient, ingredients, Medication, validateMedication } from '../../domain/medications';
import { useApp } from '../../state/AppState';
import { colors } from '../../theme';

type Props = {
  medication?: Medication;
  onClose: () => void;
  onSaved: (text: string) => void;
};

export function MedicationEditor({ medication, onClose, onSaved }: Props) {
  const { today, update } = useApp();
  const [name, setName] = useState(medication?.name ?? '');
  const [dose, setDose] = useState(medication?.dose ?? '');
  const [ingredient, setIngredient] = useState<Ingredient>(medication?.ingredient ?? 'unknown');
  const [start, setStart] = useState(medication?.start ?? today);
  const [end, setEnd] = useState<string | undefined>(medication?.end);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  function save() {
    const entry: Medication = {
      id: medication?.id ?? `medication-${Date.now()}`,
      name: name.trim(),
      dose: dose.trim(),
      ingredient,
      start,
      end,
    };
    const validation = validateMedication(entry, today);
    if (validation) {
      setError(validation);
      return;
    }
    const saved = update((data) => ({
      ...data,
      medications: [...data.medications.filter(({ id }) => id !== entry.id), entry],
    }));
    if (!saved) {
      setError('Сначала восстановите доступ к записям через уведомление на экране.');
      return;
    }
    onSaved('Приём записан');
    onClose();
  }

  function remove() {
    if (
      !update((data) => ({
        ...data,
        medications: data.medications.filter(({ id }) => id !== medication?.id),
      }))
    ) {
      setError('Не удалось изменить записи.');
      return;
    }
    onSaved('Запись удалена');
    onClose();
  }

  return (
    <Sheet title={medication ? 'Приём препарата' : 'Добавить препарат'} onClose={onClose}>
      <AppText style={commonStyles.label}>Название с упаковки</AppText>
      <TextInput
        accessibilityLabel="Название препарата"
        value={name}
        onChangeText={setName}
        maxLength={80}
        placeholder="Например, Спиронолактон"
        style={commonStyles.input}
      />
      <AppText style={commonStyles.label}>Действующее вещество и форма</AppText>
      <AppText muted style={styles.hint}>
        Сверьте с упаковкой. Для остальных средств пока нет справки в базе.
      </AppText>
      <View style={styles.options}>
        {ingredients.map((option) => (
          <Pressable
            key={option.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: ingredient === option.id }}
            onPress={() => setIngredient(option.id)}
            style={[styles.option, ingredient === option.id && styles.selected]}
          >
            <Icon name={ingredient === option.id ? 'check' : 'circle'} size={18} />
            <AppText style={styles.optionText}>{option.label}</AppText>
          </Pressable>
        ))}
      </View>
      <AppText style={commonStyles.label}>Как принимаете · необязательно</AppText>
      <TextInput
        accessibilityLabel="Запись о приёме"
        value={dose}
        onChangeText={setDose}
        maxLength={80}
        placeholder="Схема, которую назначил врач"
        style={commonStyles.input}
      />
      <DateField label="Начало приёма" value={start} today={today} onChange={setStart} />
      <DateField
        label="Окончание приёма"
        value={end}
        today={today}
        minDate={start}
        placeholder="Принимаю сейчас"
        onChange={setEnd}
        onClear={() => setEnd(undefined)}
      />
      {!!error && (
        <AppText accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
      <Button title="Сохранить" onPress={save} style={styles.action} />
      {medication && (
        <Button
          title={confirmDelete ? 'Подтвердить удаление записи' : 'Удалить запись'}
          secondary
          icon="trash"
          style={styles.action}
          onPress={() => (confirmDelete ? remove() : setConfirmDelete(true))}
        />
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  hint: { fontSize: 12, lineHeight: 19, marginBottom: 12 },
  options: { gap: 8 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 13,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    backgroundColor: colors.white,
  },
  selected: { backgroundColor: colors.lavender, borderColor: colors.purple },
  optionText: { flex: 1, fontSize: 13, lineHeight: 19 },
  error: { marginTop: 15, color: colors.redDark, lineHeight: 20 },
  action: { marginTop: 16 },
});

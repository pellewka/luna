import { useState } from 'react';
import { TextInput, View } from 'react-native';
import {
  Button,
  Card,
  Header,
  IconButton,
  Notice,
  Screen,
  Section,
  AppText,
  commonStyles,
} from '../components/ui';
import { Sheet } from '../components/Sheet';
import { useApp } from '../state/AppState';
import { removeAllAttachments } from '../features/documents/files';
import { colors } from '../theme';

type StepperProps = {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
};

function Stepper({ label, value, onChange, min, max }: StepperProps) {
  return (
    <View style={[commonStyles.between, { gap: 10, marginTop: 20 }]}>
      <AppText style={{ flex: 1, fontSize: 13, lineHeight: 19 }}>{label}</AppText>
      <View style={[commonStyles.row, { gap: 8 }]}>
        <IconButton
          name="left"
          label={'Уменьшить: ' + label}
          background={colors.lilac}
          onPress={() => onChange(Math.max(min, value - 1))}
        />
        <AppText style={{ minWidth: 25, textAlign: 'center', fontSize: 17 }}>{value}</AppText>
        <IconButton
          name="right"
          label={'Увеличить: ' + label}
          background={colors.lilac}
          onPress={() => onChange(Math.min(max, value + 1))}
        />
      </View>
    </View>
  );
}

export function Profile({
  onBack,
  notify,
  onClear,
}: {
  onBack: () => void;
  notify: (message: string) => void;
  onClear: () => void;
}) {
  const { data, update, clear } = useApp();
  const [name, setName] = useState(data.name);
  const [cycle, setCycle] = useState(data.cycleLength);
  const [period, setPeriod] = useState(data.periodLength);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  function save() {
    const saved = update((current) => ({
      ...current,
      name: name.trim(),
      cycleLength: cycle,
      periodLength: Math.min(period, cycle - 1),
    }));
    if (!saved) {
      setError('Не удалось сохранить настройки. Повторите чтение записей.');
      return;
    }
    setError('');
    notify('Настройки сохранены');
  }

  function deleteRecords() {
    try {
      removeAllAttachments();
    } catch {
      setError('Не удалось удалить вложения. Повторите попытку.');
      setConfirm(false);
      return;
    }
    clear();
    onClear();
    setName('');
    setCycle(28);
    setPeriod(5);
    setConfirm(false);
    notify('Локальные записи удалены');
  }

  return (
    <Screen>
      <Header title="Личный кабинет" subtitle="Ваши настройки" onBack={onBack} />
      <Card>
        <AppText style={[commonStyles.label, { marginTop: 0 }]}>Как к вам обращаться?</AppText>
        <TextInput
          accessibilityLabel="Ваше имя"
          placeholder="Имя — по желанию"
          value={name}
          onChangeText={setName}
          maxLength={30}
          autoCapitalize="words"
          style={commonStyles.input}
        />
        <Stepper
          label="Длина цикла без истории"
          value={cycle}
          onChange={(value) => {
            setCycle(value);
            setPeriod(Math.min(period, value - 1));
          }}
          min={15}
          max={90}
        />
        <Stepper
          label="Дней месячных в прогнозе"
          value={period}
          onChange={setPeriod}
          min={1}
          max={Math.min(cycle - 1, 31)}
        />
        <AppText muted style={{ fontSize: 12, lineHeight: 19, marginTop: 18 }}>
          При наличии истории прогноз использует последние шесть интервалов. Это приблизительная
          оценка.
        </AppText>
        {!!error && (
          <AppText accessibilityRole="alert" style={{ color: colors.redDark, marginTop: 12 }}>
            {error}
          </AppText>
        )}
        <Button title="Сохранить настройки" onPress={save} style={{ marginTop: 20 }} />
      </Card>
      <Section title="Ваши данные" />
      <Notice icon="lock">
        Дневник хранится на устройстве. Доступ помощника включается отдельно в чате. Переписка не
        сохраняется после перезапуска приложения.
      </Notice>
      <Button
        title="Удалить все локальные записи"
        icon="trash"
        secondary
        onPress={() => setConfirm(true)}
        style={{ marginTop: 18 }}
      />
      {confirm && (
        <Sheet title="Удалить записи?" onClose={() => setConfirm(false)}>
          <AppText style={{ lineHeight: 23 }}>
            Даты месячных, симптомы, препараты, анализы, справки, вложения и настройки дневника
            будут удалены с этого устройства. Отменить удаление нельзя.
          </AppText>
          <Button
            title="Удалить записи с устройства"
            onPress={deleteRecords}
            style={{ marginTop: 22, backgroundColor: colors.redDark }}
          />
          <Button
            title="Оставить записи"
            secondary
            onPress={() => setConfirm(false)}
            style={{ marginTop: 10 }}
          />
        </Sheet>
      )}
    </Screen>
  );
}

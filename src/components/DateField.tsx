import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { addDays, formatDate } from '../domain/dates';
import { colors } from '../theme';
import { MonthGrid } from './MonthGrid';
import { Button, Icon, AppText, commonStyles } from './ui';

type Props = {
  label: string;
  value?: string;
  today: string;
  onChange: (date: string) => void;
  onClear?: () => void;
  placeholder?: string;
  minDate?: string;
};

export function DateField({
  label,
  value,
  today,
  onChange,
  onClear,
  placeholder = 'Выбрать дату',
  minDate,
}: Props) {
  const [expanded, setExpanded] = useState(false);
  const [month, setMonth] = useState((value || today).slice(0, 7) + '-01');
  function choose(date: string) {
    onChange(date);
    setExpanded(false);
  }
  return (
    <View>
      <AppText style={commonStyles.label}>{label}</AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ expanded }}
        onPress={() => {
          setMonth((value || today).slice(0, 7) + '-01');
          setExpanded(!expanded);
        }}
        style={[commonStyles.input, styles.field]}
      >
        <Icon name="calendar" size={20} />
        <AppText style={{ flex: 1 }}>
          {value
            ? formatDate(value, { day: 'numeric', month: 'long', year: 'numeric' })
            : placeholder}
        </AppText>
        <Icon name={expanded ? 'close' : 'right'} size={18} />
      </Pressable>
      {expanded && (
        <View style={styles.picker}>
          <MonthGrid
            month={month}
            onMonthChange={setMonth}
            today={today}
            selected={value}
            maxDate={today}
            minDate={minDate}
            onSelect={choose}
          />
          <View style={styles.shortcuts}>
            <Button compact secondary title="Сегодня" onPress={() => choose(today)} />
            {(!minDate || addDays(today, -1) >= minDate) && (
              <Button compact secondary title="Вчера" onPress={() => choose(addDays(today, -1))} />
            )}
          </View>
          {onClear && (
            <Button
              secondary
              title="Дата не указана"
              onPress={() => {
                onClear();
                setExpanded(false);
              }}
              style={{ marginTop: 10 }}
            />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  picker: {
    borderRadius: 18,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 10,
    marginTop: 8,
  },
  shortcuts: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 10 },
});

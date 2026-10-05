import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { formatDate, monthCells, shiftMonth } from '../domain/cycle';
import { DateRange } from '../domain/periods';
import { colors } from '../theme';
import { IconButton, AppText, commonStyles } from './ui';

type Props = {
  month: string;
  onMonthChange: (month: string) => void;
  today: string;
  selected?: string;
  range?: DateRange;
  minDate?: string;
  maxDate?: string;
  onSelect: (date: string) => void;
  onLongPress?: (date: string) => void;
  isPeriod?: (date: string) => boolean;
  isPredicted?: (date: string) => boolean;
  hasEntry?: (date: string) => boolean;
};

export function MonthGrid({
  month,
  onMonthChange,
  today,
  selected,
  range,
  minDate,
  maxDate,
  onSelect,
  onLongPress,
  isPeriod,
  isPredicted,
  hasEntry,
}: Props) {
  const [choosingMonth, setChoosingMonth] = useState(false);
  const [year, setYear] = useState(Number(month.slice(0, 4)));
  return (
    <View>
      <View style={[commonStyles.between, styles.heading]}>
        <IconButton
          name="left"
          label={choosingMonth ? 'Предыдущий год' : 'Предыдущий месяц'}
          onPress={() =>
            choosingMonth
              ? setYear((value) => Math.max(1900, value - 1))
              : onMonthChange(shiftMonth(month, -1))
          }
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={choosingMonth ? 'Вернуться к дням' : 'Выбрать месяц и год'}
          onPress={() => {
            setYear(Number(month.slice(0, 4)));
            setChoosingMonth(!choosingMonth);
          }}
          style={styles.monthButton}
        >
          <AppText style={styles.month}>
            {choosingMonth
              ? year
              : formatDate(month, { month: 'long', year: 'numeric' }).replace(' г.', '')}
          </AppText>
        </Pressable>
        <IconButton
          name="right"
          label={choosingMonth ? 'Следующий год' : 'Следующий месяц'}
          onPress={() =>
            choosingMonth
              ? setYear((value) => Math.min(9998, value + 1))
              : onMonthChange(shiftMonth(month, 1))
          }
        />
      </View>
      {choosingMonth ? (
        <View style={styles.monthChoices}>
          {Array.from({ length: 12 }, (_, index) => {
            const value = `${year}-${String(index + 1).padStart(2, '0')}-01`;
            const disabled = !!(
              (maxDate && value.slice(0, 7) > maxDate.slice(0, 7)) ||
              (minDate && value.slice(0, 7) < minDate.slice(0, 7))
            );
            return (
              <Pressable
                key={value}
                accessibilityRole="button"
                disabled={disabled}
                accessibilityState={{ disabled }}
                onPress={() => {
                  onMonthChange(value);
                  setChoosingMonth(false);
                }}
                style={[styles.monthChoice, disabled && styles.faded]}
              >
                <AppText style={styles.monthName}>{formatDate(value, { month: 'long' })}</AppText>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <View style={styles.grid}>
          {['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'].map((day) => (
            <AppText key={day} muted style={styles.weekday}>
              {day}
            </AppText>
          ))}
          {monthCells(month).map(({ date, current }) => {
            const disabled = !!((minDate && date < minDate) || (maxDate && date > maxDate));
            const endpoint = range ? date === range.start || date === range.end : date === selected;
            const inside = range && date >= range.start && date <= range.end;
            const period = isPeriod?.(date);
            const predicted = isPredicted?.(date);
            const entry = hasEntry?.(date);
            return (
              <View key={date} style={styles.cell}>
                {inside && (
                  <View
                    style={[
                      styles.band,
                      date === range.start && styles.bandStart,
                      date === range.end && styles.bandEnd,
                    ]}
                  />
                )}
                <Pressable
                  testID={`day-${date}`}
                  accessibilityRole="button"
                  accessibilityLabel={`${formatDate(date, { day: 'numeric', month: 'long', year: 'numeric' })}${period ? ', месячные' : ''}${inside ? ', выбранный диапазон' : ''}`}
                  accessibilityState={{ selected: !!endpoint || !!inside, disabled }}
                  disabled={disabled}
                  onPress={() => {
                    onSelect(date);
                    if (!current) onMonthChange(date.slice(0, 7) + '-01');
                  }}
                  onLongPress={onLongPress ? () => onLongPress(date) : undefined}
                  style={[
                    styles.day,
                    period && styles.period,
                    predicted && styles.predicted,
                    endpoint && styles.selected,
                    (!current || disabled) && styles.faded,
                  ]}
                >
                  <AppText
                    style={[
                      styles.dayText,
                      date === today && styles.today,
                      period && { color: colors.roseDark },
                      endpoint && { color: colors.white },
                    ]}
                  >
                    {Number(date.slice(-2))}
                  </AppText>
                  {(entry || date === today) && (
                    <View style={[styles.dot, endpoint && { backgroundColor: colors.white }]} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: 10 },
  month: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  monthButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 },
  monthChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  monthChoice: {
    flexBasis: '30%',
    flexGrow: 1,
    minHeight: 48,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.lilac,
  },
  monthName: { textTransform: 'capitalize', fontSize: 13 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: '14.285714%', textAlign: 'center', fontSize: 10, paddingBottom: 10 },
  cell: { width: '14.285714%', height: 46, alignItems: 'center', justifyContent: 'center' },
  day: {
    width: '96%',
    maxWidth: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  dayText: { fontSize: 15 },
  today: { fontWeight: '700' },
  period: { backgroundColor: colors.rose },
  predicted: { borderStyle: 'dashed', borderColor: '#DFA8B6', backgroundColor: '#FFF6F7' },
  selected: { backgroundColor: colors.purple, borderStyle: 'solid', borderColor: colors.purple },
  faded: { opacity: 0.3 },
  band: { position: 'absolute', height: 36, left: 0, right: 0, backgroundColor: colors.lavender },
  bandStart: { left: '50%' },
  bandEnd: { right: '50%' },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 4,
    position: 'absolute',
    bottom: 4,
    backgroundColor: colors.purple,
  },
});

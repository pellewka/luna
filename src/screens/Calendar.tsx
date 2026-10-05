import { useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { MonthGrid } from '../components/MonthGrid';
import {
  Badge,
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
import {
  averageCycle,
  cycleDay,
  daysBetween,
  formatDate,
  isPredicted,
  nextPeriod,
  Period,
  periodAt,
  validatePeriod,
} from '../domain/cycle';
import { DateRange, selectRangeDate } from '../domain/periods';
import { useApp } from '../state/AppState';
import { colors, serif } from '../theme';

type RangeDraft = DateRange & { id?: string };
type Props = {
  initialDate: string;
  markDay: (date: string) => void;
  openSymptoms: (date: string) => void;
  notify: (message: string) => void;
};

export function Calendar({ initialDate, markDay, openSymptoms, notify }: Props) {
  const { data, today, update } = useApp();
  const scroll = useRef<ScrollView>(null);
  const [selected, setSelected] = useState(initialDate);
  const [month, setMonth] = useState(initialDate.slice(0, 7) + '-01');
  const [range, setRange] = useState<RangeDraft | null>(null);
  const [edge, setEdge] = useState<'start' | 'end'>('start');
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const period = periodAt(data.periods, selected);
  const entry = data.journal[selected];
  const day = cycleDay(data.periods, selected);
  const future = selected > today;
  const average = averageCycle(data.periods, data.cycleLength);
  const next = nextPeriod(data);
  const history = [...data.periods].sort((a, b) => b.start.localeCompare(a.start));

  function beginRange(record?: Period, start = selected > today ? today : selected) {
    setRange(record ? { ...record } : { start, end: start });
    setEdge('start');
    setMonth((record?.start || start).slice(0, 7) + '-01');
    setError('');
    setConfirmDelete(false);
    scroll.current?.scrollTo({ y: 0, animated: true });
  }

  function chooseDate(date: string) {
    if (!range) {
      setSelected(date);
      return;
    }
    setRange({ ...range, ...selectRangeDate(range, date, edge) });
    setEdge('end');
    setError('');
    setConfirmDelete(false);
  }

  function saveRange() {
    if (!range) return;
    const validation = validatePeriod(range.start, range.end, data.periods, today, range.id);
    if (validation) {
      setError(validation);
      return;
    }
    const record = { id: range.id || `period-${Date.now()}`, start: range.start, end: range.end };
    if (
      !update((current) => ({
        ...current,
        periods: [...current.periods.filter(({ id }) => id !== record.id), record],
      }))
    ) {
      setError('Сначала восстановите доступ к записям.');
      return;
    }
    setSelected(record.start);
    setRange(null);
    notify('Даты месячных сохранены');
  }

  function deleteRange() {
    if (!range?.id) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    if (
      !update((current) => ({
        ...current,
        periods: current.periods.filter(({ id }) => id !== range.id),
      }))
    ) {
      setError('Не удалось изменить записи.');
      return;
    }
    setRange(null);
    notify('Запись удалена');
  }

  return (
    <Screen scrollRef={scroll}>
      <Header
        title="Календарь цикла"
        subtitle={range ? 'Выберите начало и конец' : 'Ваши дни и самочувствие'}
        right={
          <IconButton
            name="calendar"
            label="Перейти к сегодня"
            background={colors.lavender}
            onPress={() => {
              setMonth(today.slice(0, 7) + '-01');
              if (!range) setSelected(today);
            }}
          />
        }
      />
      {!range && (
        <Button
          title="Выбрать даты месячных"
          icon="calendar"
          secondary
          onPress={() => beginRange(period)}
          style={styles.rangeButton}
        />
      )}
      <Card style={styles.calendar}>
        {range && (
          <>
            <View style={styles.rangeFields}>
              {(['start', 'end'] as const).map((key) => (
                <Pressable
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={
                    key === 'start' ? 'Выбрать начало месячных' : 'Выбрать конец месячных'
                  }
                  accessibilityState={{ selected: edge === key }}
                  onPress={() => setEdge(key)}
                  style={[styles.rangeField, edge === key && styles.activeField]}
                >
                  <AppText muted style={styles.caption}>
                    {key === 'start' ? 'Начало' : 'Конец'}
                  </AppText>
                  <AppText style={styles.rangeDate}>{formatDate(range[key])}</AppText>
                </Pressable>
              ))}
            </View>
            <AppText style={styles.hint}>
              {edge === 'start'
                ? 'Нажмите первый день на календаре.'
                : 'Теперь нажмите последний день. Для одного дня выберите ту же дату.'}
            </AppText>
          </>
        )}
        <MonthGrid
          month={month}
          onMonthChange={setMonth}
          today={today}
          selected={range ? undefined : selected}
          range={range || undefined}
          maxDate={range ? today : undefined}
          onSelect={chooseDate}
          onLongPress={(date) => {
            if (!range && date <= today) {
              beginRange(periodAt(data.periods, date), date);
              setEdge('end');
            }
          }}
          isPeriod={(date) => !!periodAt(data.periods, date)}
          isPredicted={(date) => !range && isPredicted(data, date, today)}
          hasEntry={(date) => !!data.journal[date]}
        />
        {range ? (
          <View style={styles.rangeActions}>
            {!!error && (
              <AppText accessibilityRole="alert" style={styles.error}>
                {error}
              </AppText>
            )}
            <Button
              title={`Сохранить · ${daysBetween(range.start, range.end) + 1} дн.`}
              icon="check"
              onPress={saveRange}
            />
            <Button title="Отмена" secondary onPress={() => setRange(null)} />
            {!!range.id && (
              <Button
                title={confirmDelete ? 'Подтвердить удаление' : 'Удалить эту запись'}
                secondary
                icon="trash"
                onPress={deleteRange}
              />
            )}
          </View>
        ) : (
          <View style={styles.legend}>
            <Badge label="Месячные" background={colors.rose} color={colors.roseDark} />
            <AppText muted style={styles.caption}>
              Пунктир — прогноз · точка — запись
            </AppText>
          </View>
        )}
      </Card>
      {!range && (
        <>
          <Section
            title={selected === today ? `Сегодня, ${formatDate(selected)}` : formatDate(selected)}
          />
          <Card>
            <View style={commonStyles.between}>
              <AppText style={styles.sectionTitle}>
                {period ? 'Месячные отмечены' : 'Ваш дневник'}
              </AppText>
              {day && !future ? <Badge label={`${day} день`} /> : null}
            </View>
            {entry ? (
              <View style={styles.entry}>
                <View style={styles.chips}>
                  {entry.symptoms.map((name) => (
                    <Badge key={name} label={name} />
                  ))}
                </View>
                {!!entry.note && <AppText style={styles.note}>{entry.note}</AppText>}
              </View>
            ) : (
              <AppText muted style={styles.empty}>
                {future
                  ? 'Прогноз. Будущие дни пока нельзя отметить.'
                  : 'Добавьте запись о самочувствии.'}
              </AppText>
            )}
            {!future && (
              <View style={styles.dayActions}>
                <Button
                  compact
                  secondary
                  title={period ? 'Изменить даты' : 'Месячные'}
                  icon="drop"
                  onPress={() => (period ? beginRange(period) : markDay(selected))}
                  style={{ flex: 1 }}
                />
                <Button
                  compact
                  title="Симптомы"
                  icon="plus"
                  onPress={() => openSymptoms(selected)}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </Card>
        </>
      )}
      <Section title="О вашем цикле" />
      <View style={styles.statistics}>
        <Card style={styles.stat}>
          <AppText style={styles.statValue}>
            {average} <AppText muted>дней</AppText>
          </AppText>
          <AppText muted style={styles.caption}>
            {data.periods.length > 1 ? 'Средняя длина цикла' : 'Длина из настроек'}
          </AppText>
        </Card>
        <Card style={styles.stat}>
          <AppText style={styles.statValue}>
            {history.length ? daysBetween(history[0].start, history[0].end) + 1 : '—'}{' '}
            <AppText muted>дней</AppText>
          </AppText>
          <AppText muted style={styles.caption}>
            Последние месячные
          </AppText>
        </Card>
      </View>
      <View style={{ marginTop: 14 }}>
        <Notice>
          {next
            ? `Расчётный следующий старт — ${formatDate(next)}.${next < today ? ' Дата прошла: проверьте, все ли дни отмечены.' : ''} Прогноз приблизительный.`
            : 'Отметьте месячные, чтобы увидеть день цикла и прогноз.'}
        </Notice>
      </View>
      <Section title="История месячных" />
      {history.length ? (
        <Card style={{ paddingVertical: 4 }}>
          {history.map((record, index) => (
            <Pressable
              key={record.id}
              accessibilityRole="button"
              accessibilityLabel={`Изменить месячные ${formatDate(record.start)}`}
              onPress={() => beginRange(record)}
              style={[styles.historyRow, index > 0 && styles.historyBorder]}
            >
              <View style={{ flex: 1 }}>
                <AppText>
                  {formatDate(record.start)} — {formatDate(record.end)}
                </AppText>
                <AppText muted style={styles.caption}>
                  {daysBetween(record.start, record.end) + 1} дн. · {record.start.slice(0, 4)}
                </AppText>
              </View>
              <AppText style={styles.edit}>Изменить</AppText>
            </Pressable>
          ))}
        </Card>
      ) : (
        <AppText muted>Пока нет записей.</AppText>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  rangeButton: { marginBottom: 16 },
  calendar: { padding: 12 },
  rangeFields: { flexDirection: 'row', gap: 10 },
  rangeField: { flex: 1, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 12 },
  activeField: { borderColor: colors.purple, backgroundColor: colors.lilac },
  rangeDate: { fontSize: 16, fontWeight: '600', marginTop: 6 },
  caption: { fontSize: 11, lineHeight: 17 },
  hint: { fontSize: 12, lineHeight: 18, marginVertical: 12, color: colors.purpleDark },
  rangeActions: { gap: 9, marginTop: 14 },
  error: { color: colors.redDark, lineHeight: 20 },
  legend: { gap: 8, marginTop: 15, paddingTop: 12, borderTopWidth: 1, borderColor: colors.line },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  entry: { marginTop: 14, gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  note: { lineHeight: 21 },
  empty: { fontSize: 13, lineHeight: 20, marginTop: 12 },
  dayActions: { flexDirection: 'row', gap: 9, marginTop: 17 },
  statistics: { flexDirection: 'row', gap: 10 },
  stat: { flex: 1, backgroundColor: colors.lilac, borderWidth: 0 },
  statValue: { fontFamily: serif, fontSize: 28, marginBottom: 6 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16 },
  historyBorder: { borderTopWidth: 1, borderColor: colors.line },
  edit: { fontSize: 11, color: colors.purpleDark },
});

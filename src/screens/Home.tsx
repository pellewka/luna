import { Pressable, StyleSheet, View } from 'react-native';
import { addDays, averageCycle, cycleDay, formatDate, periodAt } from '../domain/cycle';
import { useApp } from '../state/AppState';
import {
  Badge,
  Button,
  CycleRing,
  Icon,
  IconButton,
  Screen,
  Section,
  AppText,
  commonStyles,
} from '../components/ui';
import { colors, serif } from '../theme';
import { symptomOptions } from '../constants/symptoms';
import type { Navigate } from '../navigation/routes';

type Props = {
  navigate: Navigate;
  markDay: (date: string) => void;
  openSymptoms: (date: string) => void;
  openCalendar: (date: string) => void;
};
export function Home({ navigate, markDay, openSymptoms, openCalendar }: Props) {
  const { data, today } = useApp();
  const day = cycleDay(data.periods, today),
    period = periodAt(data.periods, today);
  const symptoms = data.journal[today]?.symptoms || [];
  const offset = (new Date(`${today}T12:00:00`).getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - offset));
  return (
    <Screen>
      <View style={styles.top}>
        <View style={[commonStyles.row, { gap: 7 }]}>
          <Icon name="moon" size={23} stroke={1.5} />
          <AppText style={styles.logo}>луна</AppText>
          <View style={styles.logoDot} />
        </View>
        <IconButton
          name="user"
          label="Личный кабинет"
          onPress={() => navigate('profile')}
          background={colors.lavender}
        />
      </View>
      <AppText style={styles.date}>
        {formatDate(today, { day: 'numeric', month: 'long', weekday: 'long' }).toLocaleUpperCase(
          'ru-RU',
        )}
      </AppText>
      <AppText accessibilityRole="header" style={styles.greeting}>
        {data.name ? 'Привет, ' + data.name : 'Добро пожаловать'}{' '}
        <AppText style={{ fontSize: 23, color: colors.purple }}>♡</AppText>
      </AppText>
      <AppText muted style={{ marginTop: 5, marginBottom: 22 }}>
        Побудьте сегодня на своей стороне.
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть календарь цикла"
        onPress={() => openCalendar(today)}
        style={styles.hero}
      >
        <View style={styles.heroCircle} />
        <View style={{ flex: 1, paddingVertical: 8, paddingRight: 2 }}>
          <View style={[commonStyles.row, { gap: 5 }]}>
            <Icon name="sparkles" size={14} />
            <AppText style={styles.eyebrow}>ВАШ РИТМ СЕГОДНЯ</AppText>
          </View>
          <AppText style={styles.heroTitle}>
            {day ? 'Время заботы\nо себе' : 'У каждого тела\nсвой ритм'}
          </AppText>
          <Badge
            label={period ? 'Менструация' : day ? 'Отслеживание цикла' : 'Начнём знакомство'}
            background="#F8F0F6"
            color={period ? colors.roseDark : colors.purpleDark}
            dot
          />
          <View style={[commonStyles.row, { gap: 5, marginTop: 16 }]}>
            <AppText style={{ fontSize: 12, color: colors.purpleDark }}>Календарь цикла</AppText>
            <Icon name="arrow" size={15} />
          </View>
        </View>
        {day ? (
          <CycleRing day={day} length={averageCycle(data.periods, data.cycleLength)} size={131} />
        ) : (
          <Icon name="moon" size={66} color="#A696B9" />
        )}
      </Pressable>
      <View style={styles.week}>
        {week.map((date, i) => {
          const selected = date === today,
            active = !!periodAt(data.periods, date);
          return (
            <Pressable
              key={date}
              accessibilityRole="button"
              accessibilityLabel={formatDate(date) + (selected ? ', сегодня' : '')}
              onPress={() => openCalendar(date)}
              style={[styles.weekDay, selected && styles.weekSelected]}
            >
              <AppText style={[styles.weekLabel, selected && { color: colors.white }]}>
                {['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'][i]}
              </AppText>
              <AppText style={[styles.weekNumber, selected && { color: colors.white }]}>
                {Number(date.slice(-2))}
              </AppText>
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 4,
                  backgroundColor: selected ? '#E8D9EF' : active ? colors.roseDark : 'transparent',
                }}
              />
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', gap: 9, marginTop: 8 }}>
        <Button
          title={period ? 'Отмечено' : 'Месячные'}
          accessibilityLabel={
            period ? 'Месячные сегодня уже отмечены' : 'Отметить месячные сегодня'
          }
          icon={period ? 'check' : 'drop'}
          onPress={() => markDay(today)}
          style={{ flex: 1, backgroundColor: colors.roseDark }}
        />
        <Button
          title="Симптомы"
          accessibilityLabel="Добавить симптомы"
          icon="plus"
          secondary
          onPress={() => openSymptoms(today)}
          style={{ flex: 1 }}
        />
      </View>
      <Section title="Как вы сегодня?" action="Изменить" onPress={() => openSymptoms(today)} />
      <View style={styles.symptomRow}>
        {symptoms.length ? (
          symptoms.map((name) => {
            const option = symptomOptions.find((o) => o.name === name);
            return (
              <Pressable
                key={name}
                onPress={() => openSymptoms(today)}
                accessibilityRole="button"
                accessibilityLabel={'Изменить симптом: ' + name}
                style={[
                  styles.symptomChip,
                  { backgroundColor: option ? colors[option.tone] : colors.lilac },
                ]}
              >
                <Icon
                  name={option?.icon || 'heart'}
                  size={18}
                  color={option?.tone === 'green' ? colors.greenDark : colors.purple}
                />
                <AppText style={{ fontSize: 12 }}>{name}</AppText>
              </Pressable>
            );
          })
        ) : (
          <AppText muted style={{ fontSize: 13 }}>
            Добавьте ощущения — даже если всё хорошо.
          </AppText>
        )}
      </View>
      {!!data.journal[today]?.note && (
        <AppText muted style={{ fontSize: 12, marginTop: 10 }} numberOfLines={2}>
          {data.journal[today].note}
        </AppText>
      )}
      <Section title="Моё здоровье" action="Все документы" onPress={() => navigate('medical')} />
      <View style={{ flexDirection: 'row', gap: 11 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Мои препараты"
          onPress={() => navigate('recipes')}
          style={[styles.healthTile, { backgroundColor: '#F3EAF0' }]}
        >
          <View style={commonStyles.between}>
            <Icon name="pill" size={26} color={colors.roseDark} />
            <Icon name="arrow" size={16} color={colors.roseDark} />
          </View>
          <AppText style={styles.tileTitle}>Препараты</AppText>
          <AppText style={styles.tileSubtitle}>Даты приёма</AppText>
          <View style={[commonStyles.row, { gap: 5, marginTop: 13 }]}>
            <Icon name="file" size={13} color={colors.roseDark} />
            <AppText muted style={{ fontSize: 10, marginLeft: 3 }}>
              Ваши записи
            </AppText>
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Мои анализы"
          onPress={() => navigate('labs')}
          style={[styles.healthTile, { backgroundColor: colors.green }]}
        >
          <View style={commonStyles.between}>
            <Icon name="lab" size={26} color={colors.greenDark} />
            <Icon name="arrow" size={16} color={colors.greenDark} />
          </View>
          <AppText style={styles.tileTitle}>Анализы</AppText>
          <AppText style={styles.tileSubtitle}>Всё в одном месте</AppText>
          <AppText style={{ fontSize: 10, marginTop: 14, color: colors.greenDark }}>
            История исследований
          </AppText>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Открыть помощника"
        onPress={() => navigate('chat')}
        style={styles.connect}
      >
        <View style={styles.connectIcon}>
          <Icon name="sparkles" size={22} color={colors.purple} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '600', fontSize: 13 }}>Есть вопрос о самочувствии?</AppText>
          <AppText muted style={{ fontSize: 11, lineHeight: 17, marginTop: 3 }}>
            Помощник с проверяемыми источниками
          </AppText>
        </View>
        <Icon name="right" size={18} />
      </Pressable>
    </Screen>
  );
}
const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 21,
  },
  logo: { fontFamily: serif, fontSize: 27, letterSpacing: -1, color: colors.purpleDark },
  logoDot: {
    width: 5,
    height: 5,
    borderRadius: 5,
    backgroundColor: colors.roseDark,
    marginTop: 12,
    marginLeft: -4,
  },
  date: { fontSize: 10, fontWeight: '500', color: colors.muted, letterSpacing: 1.3 },
  greeting: { fontFamily: serif, fontSize: 33, letterSpacing: -0.9, marginTop: 9 },
  hero: {
    backgroundColor: colors.lavender,
    borderRadius: 27,
    padding: 20,
    paddingRight: 9,
    minHeight: 191,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  heroCircle: {
    position: 'absolute',
    width: 230,
    height: 230,
    borderWidth: 1,
    borderColor: '#E0D6E9',
    borderRadius: 120,
    right: -81,
    top: -78,
  },
  eyebrow: { fontSize: 9, letterSpacing: 1, color: colors.purpleDark, fontWeight: '600' },
  heroTitle: {
    fontFamily: serif,
    fontSize: 27,
    lineHeight: 30,
    letterSpacing: -0.5,
    marginTop: 12,
    marginBottom: 13,
    color: '#584765',
  },
  week: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 15, gap: 3 },
  weekDay: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
    borderRadius: 22,
    minHeight: 77,
  },
  weekSelected: { backgroundColor: colors.purple },
  weekLabel: { fontSize: 10, color: colors.muted },
  weekNumber: { fontSize: 16, fontWeight: '500' },
  symptomRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  symptomChip: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    minHeight: 44,
  },
  healthTile: { flex: 1, borderRadius: 21, padding: 17 },
  tileTitle: { fontSize: 17, fontWeight: '500', marginTop: 17 },
  tileSubtitle: { color: '#807B83', fontSize: 11, marginTop: 5 },
  connect: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 20,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 15,
    marginTop: 18,
  },
  connectIcon: {
    width: 40,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

import { StyleSheet, View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Button, AppText } from '../../components/ui';
import { colors } from '../../theme';

export function DataConsentSheet({
  kind,
  server,
  onAllow,
  onClose,
}: {
  kind: 'diary' | 'labs';
  server: string;
  onAllow: () => void;
  onClose: () => void;
}) {
  const isLabs = kind === 'labs';
  return (
    <Sheet title={isLabs ? 'Учесть ваши анализы?' : 'Учесть ваш дневник?'} onClose={onClose}>
      <AppText style={styles.text}>С каждым вопросом будут отправлены:</AppText>
      <View style={styles.details}>
        <AppText style={styles.text}>
          {isLabs
            ? 'До 30 последних анализов за год: названия, даты, результаты, единицы, референсы, раздел и название лаборатории.'
            : 'Последние 7 записей месячных, до 30 записей симптомов за 90 дней и до 20 текущих или недавно завершённых препаратов: названия, действующие вещества и даты приёма.'}
        </AppText>
      </View>
      <AppText style={styles.text}>
        {isLabs
          ? 'Демо-примеры, справки и прикреплённые файлы остаются на устройстве. Дневник подключается отдельно.'
          : 'Имя, личные заметки и дозировки остаются на устройстве. Анализы подключаются отдельно.'}
      </AppText>
      <AppText muted style={styles.caption}>
        Текст вопроса отправляется целиком. Разрешение действует до перезапуска приложения.
        Изменение доступа или передаваемых записей очищает разговор.
      </AppText>
      <AppText muted style={styles.caption}>
        Сервер: {server}
      </AppText>
      <Button title="Разрешить доступ" onPress={onAllow} style={styles.action} />
      <Button title="Пока без доступа" secondary onPress={onClose} style={styles.action} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  text: { fontSize: 14, lineHeight: 22 },
  details: { padding: 16, backgroundColor: colors.lilac, borderRadius: 18, marginVertical: 16 },
  caption: { fontSize: 12, lineHeight: 19, marginTop: 14 },
  action: { marginTop: 14 },
});

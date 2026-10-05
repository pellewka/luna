import { Pressable, StyleSheet, View } from 'react-native';
import { Button, Card, Header, Icon, IconName, Screen, Section, AppText } from '../components/ui';
import { Navigate, Route } from '../navigation/routes';
import { useApp } from '../state/AppState';
import { colors } from '../theme';

const sections: { title: string; subtitle: string; route: Route; icon: IconName; color: string }[] =
  [
    {
      title: 'Препараты',
      subtitle: 'Даты приёма',
      route: 'recipes',
      icon: 'pill',
      color: colors.rose,
    },
    {
      title: 'Справки',
      subtitle: 'Медицинские документы',
      route: 'certificates',
      icon: 'file',
      color: colors.lavender,
    },
    {
      title: 'Медкарта',
      subtitle: 'История обращений',
      route: 'record',
      icon: 'folder',
      color: colors.green,
    },
    {
      title: 'Анализы',
      subtitle: 'Результаты исследований',
      route: 'labs',
      icon: 'lab',
      color: colors.blue,
    },
  ];

export function Medical({
  navigate,
  addDocument,
}: {
  navigate: Navigate;
  addDocument: (kind: 'labs' | 'certificates') => void;
}) {
  return (
    <Screen>
      <Header title="Моё здоровье" subtitle="Документы и назначения" />
      <View style={styles.grid}>
        {sections.map((section) => (
          <Pressable
            key={section.route}
            accessibilityRole="button"
            accessibilityLabel={section.title}
            onPress={() => navigate(section.route)}
            style={[styles.tile, { backgroundColor: section.color }]}
          >
            <Icon name={section.icon} size={29} />
            <AppText style={styles.title}>{section.title}</AppText>
            <AppText muted style={styles.subtitle}>
              {section.subtitle}
            </AppText>
          </Pressable>
        ))}
      </View>
      <View style={{ gap: 10 }}>
        <Button
          title="Добавить справку"
          icon="plus"
          secondary
          onPress={() => addDocument('certificates')}
        />
        <Button title="Добавить анализ" icon="plus" onPress={() => addDocument('labs')} />
      </View>
    </Screen>
  );
}

export function MedicalRecord({ onBack, navigate }: { onBack: () => void; navigate: Navigate }) {
  const { data } = useApp();
  return (
    <Screen>
      <Header title="Медицинская карта" subtitle="Записи этого прототипа" onBack={onBack} />
      <Card>
        <AppText style={{ lineHeight: 22 }}>
          Вы сами добавляете анализы, справки и приём препаратов. Все записи сохраняются на
          устройстве.
        </AppText>
      </Card>
      <Section title="Ваши разделы" />
      <View style={{ gap: 12 }}>
        <Button
          title={`Анализы · ${data.labs.length}`}
          secondary
          icon="lab"
          onPress={() => navigate('labs')}
        />
        <Button
          title={`Справки · ${data.certificates.length}`}
          secondary
          icon="file"
          onPress={() => navigate('certificates')}
        />
        <Button
          title={`Препараты · ${data.medications.length}`}
          secondary
          icon="pill"
          onPress={() => navigate('recipes')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 22 },
  tile: { flexBasis: '46%', flexGrow: 1, minHeight: 160, borderRadius: 23, padding: 20 },
  title: { fontSize: 18, fontWeight: '600', marginTop: 22 },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 6 },
});

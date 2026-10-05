import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Icon, AppText } from '../components/ui';
import { colors } from '../theme';
import { Navigate, Route, parentRoute, tabs } from './routes';

export function BottomTabs({ route, navigate }: { route: Route; navigate: Navigate }) {
  return (
    <SafeAreaView edges={['bottom']} style={styles.safe}>
      <View accessibilityRole="tablist" style={styles.tabs}>
        {tabs.map((tab) => {
          const selected = parentRoute(route) === tab.id;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected }}
              onPress={() => navigate(tab.id)}
              style={styles.tab}
            >
              <View style={[styles.icon, selected && styles.active]}>
                <Icon
                  name={tab.icon}
                  size={21}
                  color={selected ? colors.purpleDark : colors.muted}
                />
              </View>
              <AppText style={[styles.label, selected && styles.activeLabel]}>{tab.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.white, borderTopWidth: 1, borderColor: colors.line },
  tabs: { flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 8 },
  tab: { flex: 1, alignItems: 'center', minHeight: 50 },
  icon: { width: 44, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: colors.lavender },
  label: { fontSize: 10, marginTop: 4, color: colors.muted },
  activeLabel: { color: colors.purpleDark, fontWeight: '600' },
});

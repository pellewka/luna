import { Pressable, StyleSheet, View } from 'react-native';
import { colors } from '../theme';
import { AppText } from './ui';

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.row}>
      {options.map((option) => (
        <Pressable
          key={option.id}
          accessibilityRole="radio"
          accessibilityState={{ checked: value === option.id }}
          onPress={() => onChange(option.id)}
          style={[styles.chip, value === option.id && styles.active]}
        >
          <AppText style={[styles.label, value === option.id && styles.activeLabel]}>
            {option.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 15,
    backgroundColor: colors.lilac,
  },
  active: { backgroundColor: colors.purple },
  label: { fontSize: 13, color: colors.purpleDark },
  activeLabel: { color: colors.white },
});

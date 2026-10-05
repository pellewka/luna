import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Cloud,
  Droplet,
  FileText,
  FlaskConical,
  FolderHeart,
  Heart,
  House,
  Info,
  Leaf,
  LockKeyhole,
  Moon,
  Pill,
  Plus,
  RefreshCw,
  Settings2,
  Smile,
  Sparkles,
  Sun,
  Trash2,
  UserRound,
  X,
} from 'lucide-react-native';
import Svg, { Circle as SvgCircle, Line } from 'react-native-svg';
import { colors, serif } from '../theme';

const icons = {
  back: ArrowLeft,
  arrow: ArrowRight,
  calendar: CalendarDays,
  check: Check,
  left: ChevronLeft,
  right: ChevronRight,
  circle: Circle,
  cloud: Cloud,
  drop: Droplet,
  file: FileText,
  lab: FlaskConical,
  folder: FolderHeart,
  heart: Heart,
  home: House,
  info: Info,
  leaf: Leaf,
  lock: LockKeyhole,
  moon: Moon,
  pill: Pill,
  plus: Plus,
  refresh: RefreshCw,
  settings: Settings2,
  smile: Smile,
  sparkles: Sparkles,
  sun: Sun,
  trash: Trash2,
  user: UserRound,
  close: X,
};
export type IconName = keyof typeof icons;
export function Icon({
  name,
  size = 22,
  color = colors.purple,
  stroke = 1.65,
}: {
  name: IconName;
  size?: number;
  color?: string;
  stroke?: number;
}) {
  const Component = icons[name];
  return <Component size={size} color={color} strokeWidth={stroke} />;
}
export function AppText({
  children,
  style,
  muted = false,
  ...props
}: React.ComponentProps<typeof Text> & { muted?: boolean }) {
  return (
    <Text {...props} style={[commonStyles.text, muted && { color: colors.muted }, style]}>
      {children}
    </Text>
  );
}

export function TextField({
  label,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  return (
    <View>
      <AppText style={commonStyles.label}>{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[commonStyles.input, props.style]}
      />
    </View>
  );
}
export function Button({
  title,
  onPress,
  icon,
  secondary = false,
  disabled = false,
  style,
  accessibilityLabel,
  compact = false,
}: {
  title: string;
  onPress: () => void;
  icon?: IconName;
  secondary?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        commonStyles.button,
        secondary && commonStyles.secondary,
        compact && { minHeight: 44, paddingHorizontal: 14 },
        style,
        pressed && { opacity: 0.78, transform: [{ scale: 0.99 }] },
        disabled && { opacity: 0.4 },
      ]}
    >
      {icon && <Icon name={icon} size={19} color={secondary ? colors.purpleDark : colors.white} />}
      <AppText style={[commonStyles.buttonText, secondary && { color: colors.purpleDark }]}>
        {title}
      </AppText>
    </Pressable>
  );
}
export function IconButton({
  name,
  onPress,
  label,
  background = colors.white,
  color = colors.purple,
  size = 44,
}: {
  name: IconName;
  onPress: () => void;
  label: string;
  background?: string;
  color?: string;
  size?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: background,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: pressed ? 0.55 : 1,
      })}
    >
      <Icon name={name} color={color} />
    </Pressable>
  );
}
export function Section({
  title,
  action,
  onPress,
  style,
}: {
  title: string;
  action?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[commonStyles.section, style]}>
      <AppText style={commonStyles.sectionTitle}>{title}</AppText>
      {action && onPress && (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={action + ': ' + title}
          style={commonStyles.link}
        >
          <AppText style={commonStyles.linkText}>{action}</AppText>
          <Icon name="right" size={15} />
        </Pressable>
      )}
    </View>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[commonStyles.card, style]}>{children}</View>;
}
export function Badge({
  label,
  color = colors.purpleDark,
  background = colors.lilac,
  dot = false,
}: {
  label: string;
  color?: string;
  background?: string;
  dot?: boolean;
}) {
  return (
    <View style={[commonStyles.badge, { backgroundColor: background }]}>
      {dot && <View style={{ width: 5, height: 5, borderRadius: 5, backgroundColor: color }} />}
      <AppText style={{ color, fontSize: 11, fontWeight: '500' }}>{label}</AppText>
    </View>
  );
}
export function Notice({
  children,
  tone = 'lilac',
  icon = 'info',
}: {
  children: React.ReactNode;
  tone?: 'lilac' | 'green' | 'rose';
  icon?: IconName;
}) {
  return (
    <View style={[commonStyles.notice, { backgroundColor: colors[tone] }]}>
      <Icon name={icon} size={18} color={tone === 'green' ? colors.greenDark : colors.purple} />
      <AppText style={commonStyles.noticeText}>{children}</AppText>
    </View>
  );
}
export function Header({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <View style={commonStyles.header}>
      {onBack && <IconButton name="back" label="Назад" onPress={onBack} />}
      <View style={{ flex: 1 }}>
        <AppText accessibilityRole="header" style={commonStyles.title}>
          {title}
        </AppText>
        {subtitle && (
          <AppText muted style={{ marginTop: 6, fontSize: 13 }}>
            {subtitle}
          </AppText>
        )}
      </View>
      {right}
    </View>
  );
}
export function Screen({
  children,
  scrollRef,
}: {
  children: React.ReactNode;
  scrollRef?: React.Ref<ScrollView>;
}) {
  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={commonStyles.screen}
    >
      {children}
    </ScrollView>
  );
}
export function Empty({
  title,
  text,
  icon = 'leaf',
}: {
  title: string;
  text: string;
  icon?: IconName;
}) {
  return (
    <Card style={{ alignItems: 'center', paddingVertical: 28, gap: 10 }}>
      <Icon name={icon} size={30} />
      <AppText style={commonStyles.sectionTitle}>{title}</AppText>
      <AppText muted style={{ textAlign: 'center', lineHeight: 21 }}>
        {text}
      </AppText>
    </Card>
  );
}
export function CycleRing({
  day,
  length,
  size = 138,
}: {
  day: number;
  length: number;
  size?: number;
}) {
  const center = 75,
    radius = 59;
  return (
    <View
      accessible
      accessibilityLabel={`День цикла ${day}, средняя длина ${length} дней`}
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox="0 0 150 150">
        {Array.from({ length: 28 }, (_, i) => {
          const angle = (i / 28) * Math.PI * 2 - Math.PI / 2;
          const active = i < Math.min(28, Math.ceil((day / length) * 28));
          return (
            <Line
              key={i}
              x1={center + Math.cos(angle) * (radius - 6)}
              y1={center + Math.sin(angle) * (radius - 6)}
              x2={center + Math.cos(angle) * (radius + 2)}
              y2={center + Math.sin(angle) * (radius + 2)}
              stroke={active ? colors.roseDark : '#D6CCE0'}
              strokeWidth={4}
              strokeLinecap="round"
            />
          );
        })}
        <SvgCircle cx={75} cy={75} r={43} fill="#F7F2F9" />
      </Svg>
      <View style={commonStyles.ringCenter}>
        <AppText
          style={{ fontFamily: serif, fontSize: 44, lineHeight: 50, color: colors.purpleDark }}
        >
          {day}
        </AppText>
        <AppText style={{ fontSize: 10, color: colors.purple }}>ДЕНЬ ЦИКЛА</AppText>
      </View>
    </View>
  );
}
export function Loading() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
      <Icon name="moon" size={40} />
      <AppText style={{ fontFamily: serif, fontSize: 32 }}>Луна</AppText>
      <ActivityIndicator color={colors.purple} />
    </View>
  );
}
export const commonStyles = StyleSheet.create({
  text: {
    fontSize: 14,
    color: colors.ink,
  },
  screen: { paddingHorizontal: 23, paddingTop: 14, paddingBottom: 28 },
  row: { flexDirection: 'row', alignItems: 'center' },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  card: {
    backgroundColor: colors.white,
    borderRadius: 23,
    padding: 18,
    borderWidth: 1,
    borderColor: '#F1EDF1',
  },
  button: {
    minHeight: 51,
    backgroundColor: colors.purple,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 18,
  },
  secondary: { backgroundColor: colors.lilac },
  buttonText: {
    color: colors.white,
    fontWeight: '600',
    fontSize: 14,
    textAlign: 'center',
    flexShrink: 1,
  },
  section: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 24,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: { fontWeight: '600', fontSize: 17, letterSpacing: -0.3, flexShrink: 1 },
  link: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2 },
  linkText: { fontSize: 12, fontWeight: '500', color: colors.purple },
  badge: {
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 9,
    gap: 5,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  notice: {
    borderRadius: 18,
    padding: 15,
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  noticeText: { flex: 1, lineHeight: 19, fontSize: 12, color: '#6E657C' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 6, marginBottom: 24 },
  title: { fontFamily: serif, fontSize: 30, letterSpacing: -0.7, lineHeight: 36 },
  ringCenter: { position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 50,
    borderRadius: 14,
    borderColor: colors.line,
    borderWidth: 1,
    backgroundColor: colors.white,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.ink,
  },
  label: { fontSize: 12, fontWeight: '500', color: colors.muted, marginBottom: 8, marginTop: 18 },
});

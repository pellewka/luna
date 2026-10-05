import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { colors } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { IconButton, AppText, commonStyles } from './ui';

export function Sheet({
  title,
  subtitle,
  children,
  onClose,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  onClose: () => void;
  footer?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityLabel="Закрыть окно"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.sheet} accessibilityViewIsModal>
          <View style={styles.handle} />
          <View style={[commonStyles.between, { paddingHorizontal: 24, paddingBottom: 8 }]}>
            <View style={{ flex: 1 }}>
              <AppText style={[commonStyles.title, { fontSize: 26 }]}>{title}</AppText>
              {subtitle && (
                <AppText muted style={{ marginTop: 4, fontSize: 13 }}>
                  {subtitle}
                </AppText>
              )}
            </View>
            <IconButton name="close" label="Закрыть" onPress={onClose} background={colors.lilac} />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 24, paddingTop: 10, paddingBottom: 36 }}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
          {footer && (
            <View style={[styles.footer, { paddingBottom: Math.max(18, insets.bottom) }]}>
              {footer}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(43, 34, 52, 0.28)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheet: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '92%',
    backgroundColor: colors.background,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: 4,
    backgroundColor: '#DAD4E0',
    alignSelf: 'center',
    marginVertical: 12,
  },
  footer: { padding: 18, paddingBottom: 30, borderTopWidth: 1, borderColor: colors.line },
});

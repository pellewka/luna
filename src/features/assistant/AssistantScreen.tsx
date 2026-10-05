import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View,
} from 'react-native';
import { Button, Header, Icon, IconButton, AppText } from '../../components/ui';
import { colors, serif } from '../../theme';
import { ConnectionSheet } from './ConnectionSheet';
import { DataConsentSheet } from './DataConsentSheet';
import { AssistantController } from './useAssistant';

const suggestions = [
  'Разбери мои анализы и объясни, чего не хватает для оценки',
  'Разбери мой цикл и изменения самочувствия',
  'Может ли мой препарат быть связан с задержкой?',
];
const modeLabels = {
  llm: 'Ответ ИИ по источникам',
  reference: 'Справка из базы знаний',
  safety: 'Обратите внимание',
  no_evidence: 'Нужно уточнение',
};

export function AssistantScreen({
  assistant,
  startWithLabs = false,
}: {
  assistant: AssistantController;
  startWithLabs?: boolean;
}) {
  const [draftMessage, setDraftMessage] = useState(startWithLabs ? suggestions[0] : '');
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [consentKind, setConsentKind] = useState<'diary' | 'labs' | null>(
    startWithLabs && !assistant.labsEnabled ? 'labs' : null,
  );
  const [linkError, setLinkError] = useState('');
  const messageList = useRef<ScrollView>(null);

  function submit() {
    if (!draftMessage.trim() || assistant.busy || !assistant.ready) return;
    void assistant.send(draftMessage);
    setDraftMessage('');
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Header
          title="Помощник"
          subtitle="Разберёмся вместе"
          right={
            <View style={styles.actions}>
              <IconButton
                name="refresh"
                label="Новый разговор"
                onPress={assistant.clear}
                background={colors.lilac}
              />
              <IconButton
                name="settings"
                label="Настройки помощника"
                onPress={() => setSettingsVisible(true)}
              />
            </View>
          }
        />
        <View style={styles.diary}>
          <Icon name="lock" size={18} />
          <AppText style={styles.diaryLabel}>Учитывать дневник</AppText>
          <Switch
            accessibilityLabel="Доступ помощника к дневнику"
            value={assistant.diaryEnabled}
            disabled={!assistant.ready}
            trackColor={{ true: colors.purple, false: colors.line }}
            onValueChange={(enabled) =>
              enabled ? setConsentKind('diary') : assistant.allowDiary(false)
            }
          />
        </View>
        <View style={[styles.diary, { marginTop: 6 }]}>
          <Icon name="lab" size={18} />
          <AppText style={styles.diaryLabel}>Учитывать анализы</AppText>
          <Switch
            accessibilityLabel="Доступ помощника к анализам"
            value={assistant.labsEnabled}
            disabled={!assistant.ready}
            trackColor={{ true: colors.purple, false: colors.line }}
            onValueChange={(enabled) =>
              enabled ? setConsentKind('labs') : assistant.allowLabs(false)
            }
          />
        </View>
      </View>
      <ScrollView
        ref={messageList}
        style={styles.messages}
        contentContainerStyle={styles.messageContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => messageList.current?.scrollToEnd({ animated: true })}
      >
        {assistant.messages.length === 0 && (
          <View style={styles.welcome}>
            <View style={styles.symbol}>
              <Icon name="sparkles" size={32} />
            </View>
            <AppText style={styles.welcomeTitle}>Можно просто спросить</AppText>
            <AppText muted style={styles.welcomeText}>
              Выберите, какие записи учитывать. Разберу доступные данные и покажу источники. Общие
              вопросы можно задавать без доступа.
            </AppText>
            <View style={styles.suggestions}>
              {suggestions.map((question) => (
                <Pressable
                  key={question}
                  accessibilityRole="button"
                  disabled={!assistant.ready}
                  onPress={() => {
                    const kind = question === suggestions[0] ? 'labs' : 'diary';
                    if (kind === 'labs' ? assistant.labsEnabled : assistant.diaryEnabled) {
                      void assistant.send(question);
                    } else {
                      setDraftMessage(question);
                      setConsentKind(kind);
                    }
                  }}
                  style={styles.suggestion}
                >
                  <AppText style={styles.suggestionText}>{question}</AppText>
                  <Icon name="arrow" size={17} />
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {assistant.messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.bubble,
              message.role === 'user' ? styles.userBubble : styles.assistantBubble,
            ]}
          >
            {message.reply && (
              <AppText style={styles.mode}>
                {modeLabels[message.reply.mode]}
                {message.reply.diary_used ? ' · с учётом дневника' : ''}
                {message.reply.labs_used ? ' · с учётом анализов' : ''}
              </AppText>
            )}
            <AppText selectable style={styles.messageText}>
              {message.content}
            </AppText>
            {!!message.reply?.notice && (
              <AppText style={styles.notice}>{message.reply.notice}</AppText>
            )}
            {!!message.reply?.sources.length && (
              <View style={styles.sources}>
                <AppText style={styles.sourceHeading}>Источники</AppText>
                {message.reply.sources.map((source) => (
                  <Pressable
                    key={source.id}
                    accessibilityRole="link"
                    accessibilityLabel={'Открыть источник: ' + source.title}
                    onPress={() => {
                      setLinkError('');
                      void Linking.openURL(source.url).catch(() =>
                        setLinkError(
                          'Не удалось открыть источник. Проверьте подключение к интернету.',
                        ),
                      );
                    }}
                    style={styles.source}
                  >
                    <Icon name="file" size={16} />
                    <View style={{ flex: 1 }}>
                      <AppText style={styles.sourceTitle}>{source.title}</AppText>
                      <AppText muted style={styles.sourceMeta}>
                        {source.publisher} · {source.language === 'en' ? 'выгрузка' : 'просмотрен'}{' '}
                        {source.checked_at}
                        {source.language === 'en' ? ' · оригинал на английском' : ''}
                      </AppText>
                    </View>
                    <Icon name="arrow" size={14} />
                  </Pressable>
                ))}
              </View>
            )}
          </View>
        ))}
        {assistant.busy && (
          <View accessibilityLiveRegion="polite" style={styles.loading}>
            <ActivityIndicator color={colors.purple} />
            <AppText muted>Ищу материалы и готовлю ответ…</AppText>
          </View>
        )}
        {!!assistant.error && (
          <View style={styles.error}>
            <AppText accessibilityRole="alert" style={styles.errorText}>
              {assistant.error}
            </AppText>
            {!!assistant.failedMessage && (
              <Button
                compact
                title="Повторить вопрос"
                secondary
                onPress={() => void assistant.send(assistant.failedMessage, true)}
                style={{ marginTop: 12 }}
              />
            )}
          </View>
        )}
        {!!linkError && (
          <AppText accessibilityRole="alert" style={styles.errorText}>
            {linkError}
          </AppText>
        )}
      </ScrollView>
      <View style={styles.composer}>
        <AppText muted style={styles.disclaimer}>
          Объясняю записи. Диагноз и лечение обсуждают с врачом.
        </AppText>
        <View style={styles.inputRow}>
          <TextInput
            accessibilityLabel="Вопрос помощнику"
            placeholder="Что вас интересует?"
            placeholderTextColor={colors.muted}
            value={draftMessage}
            onChangeText={setDraftMessage}
            multiline
            maxLength={2000}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Отправить вопрос"
            accessibilityState={{
              disabled: !assistant.ready || assistant.busy || !draftMessage.trim(),
            }}
            disabled={!assistant.ready || assistant.busy || !draftMessage.trim()}
            onPress={submit}
            style={[styles.send, (assistant.busy || !draftMessage.trim()) && styles.disabled]}
          >
            <Icon name="arrow" size={23} color={colors.white} />
          </Pressable>
        </View>
      </View>
      {settingsVisible && (
        <ConnectionSheet
          connection={assistant.connection}
          onSave={assistant.updateConnection}
          onClose={() => setSettingsVisible(false)}
        />
      )}
      {consentKind && (
        <DataConsentSheet
          kind={consentKind}
          server={assistant.connection.baseUrl}
          onClose={() => setConsentKind(null)}
          onAllow={() => {
            if (consentKind === 'labs') assistant.allowLabs(true);
            else assistant.allowDiary(true);
            setConsentKind(null);
          }}
        />
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: 23, paddingTop: 18, paddingBottom: 12 },
  actions: { flexDirection: 'row', gap: 6 },
  diary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    marginTop: -8,
    backgroundColor: colors.lilac,
    borderRadius: 16,
  },
  diaryLabel: { flex: 1, fontSize: 13 },
  messages: { flex: 1 },
  messageContent: { padding: 20, paddingTop: 6, gap: 15 },
  welcome: { alignItems: 'center', paddingTop: 24 },
  symbol: {
    width: 70,
    height: 70,
    backgroundColor: colors.lavender,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeTitle: { fontFamily: serif, fontSize: 27, marginTop: 21, textAlign: 'center' },
  welcomeText: { fontSize: 13, lineHeight: 21, textAlign: 'center', marginTop: 10, maxWidth: 320 },
  suggestions: { gap: 9, width: '100%', marginTop: 24 },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'space-between',
    padding: 15,
    backgroundColor: colors.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
  suggestionText: { flex: 1, fontSize: 13, color: colors.purpleDark },
  bubble: { borderRadius: 21, padding: 16, maxWidth: '100%' },
  userBubble: {
    backgroundColor: colors.lavender,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 5,
    maxWidth: '90%',
  },
  assistantBubble: {
    backgroundColor: colors.white,
    alignSelf: 'stretch',
    borderBottomLeftRadius: 5,
    borderWidth: 1,
    borderColor: colors.line,
  },
  mode: { color: colors.purple, fontSize: 10, marginBottom: 9, fontWeight: '600' },
  messageText: { fontSize: 14, lineHeight: 23 },
  notice: { fontSize: 11, lineHeight: 17, color: colors.muted, marginTop: 12 },
  sources: { marginTop: 15, paddingTop: 13, borderTopWidth: 1, borderColor: colors.line, gap: 10 },
  sourceHeading: { fontSize: 11, fontWeight: '600', color: colors.purpleDark },
  source: { flexDirection: 'row', alignItems: 'center', gap: 9, minHeight: 44 },
  sourceTitle: { fontSize: 12, color: colors.purpleDark, lineHeight: 18 },
  sourceMeta: { fontSize: 10, marginTop: 4, lineHeight: 15 },
  loading: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 12 },
  error: { backgroundColor: colors.rose, padding: 16, borderRadius: 18 },
  errorText: { color: colors.redDark, fontSize: 13, lineHeight: 20 },
  composer: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
  },
  disclaimer: { fontSize: 10, lineHeight: 15, marginBottom: 9, textAlign: 'center' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10 },
  input: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 18,
    paddingHorizontal: 15,
    paddingVertical: 13,
    fontSize: 15,
    color: colors.ink,
  },
  send: {
    width: 48,
    height: 48,
    borderRadius: 18,
    backgroundColor: colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});

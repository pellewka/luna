import { useEffect, useState } from 'react';
import { BackHandler, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SymptomEditor } from './src/components/SymptomEditor';
import { Loading, AppText } from './src/components/ui';
import { formatDate } from './src/domain/cycle';
import { markPeriodDay, removePeriodDay } from './src/domain/periods';
import { useAssistant } from './src/features/assistant/useAssistant';
import { AssistantScreen } from './src/features/assistant/AssistantScreen';
import { useToast } from './src/hooks/useToast';
import { BottomTabs } from './src/navigation/BottomTabs';
import { Route, parentRoute } from './src/navigation/routes';
import { Calendar } from './src/screens/Calendar';
import { Home } from './src/screens/Home';
import { Labs } from './src/screens/Labs';
import { Medical, MedicalRecord } from './src/screens/Medical';
import { Certificates } from './src/screens/Certificates';
import { MedicationsScreen } from './src/features/medications/MedicationsScreen';
import { Profile } from './src/screens/Profile';
import { AppProvider, useApp } from './src/state/AppState';
import { colors } from './src/theme';

type Editor = { date: string } | null;

function ApplicationContent() {
  const { data, ready, today, storageError, retrySave, update } = useApp();
  const [route, setRoute] = useState<Route>('home');
  const [calendarDate, setCalendarDate] = useState(today);
  const [editor, setEditor] = useState<Editor>(null);
  const [documentToAdd, setDocumentToAdd] = useState<'labs' | 'certificates' | null>(null);
  const [assistantEntry, setAssistantEntry] = useState<'labs' | null>(null);
  const { toast, action, notify } = useToast();
  const assistant = useAssistant(data, today);

  const navigate = (next: Route) => {
    setEditor(null);
    setDocumentToAdd(null);
    setAssistantEntry(null);
    setRoute(next);
  };
  function addDocument(kind: 'labs' | 'certificates') {
    navigate(kind);
    setDocumentToAdd(kind);
  }
  const openSymptoms = (date: string) => setEditor({ date });
  function markDay(date: string) {
    const result = markPeriodDay(data.periods, date, today, `period-${Date.now()}`);
    if (result.error) {
      notify(result.error);
      return;
    }
    if (!result.changed) {
      notify('Этот день уже отмечен');
      return;
    }
    if (
      !update((current) => ({
        ...current,
        periods: markPeriodDay(current.periods, date, today, `period-${Date.now()}`).periods,
      }))
    )
      return;
    notify(date === today ? 'Месячные отмечены на сегодня' : `Отмечено: ${formatDate(date)}`, {
      label: 'Отменить',
      onPress: () => {
        if (update((current) => ({ ...current, periods: removePeriodDay(current.periods, date) })))
          notify('Отметка отменена');
      },
    });
  }
  const openCalendar = (date: string) => {
    setCalendarDate(date);
    navigate('calendar');
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (editor) {
        setEditor(null);
        return true;
      }
      if (route !== 'home') {
        setRoute(parentRoute(route) === route ? 'home' : parentRoute(route));
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [editor, route]);

  function renderScreen() {
    switch (route) {
      case 'home':
        return (
          <Home
            navigate={navigate}
            markDay={markDay}
            openSymptoms={openSymptoms}
            openCalendar={openCalendar}
          />
        );
      case 'calendar':
        return (
          <Calendar
            initialDate={calendarDate}
            markDay={markDay}
            openSymptoms={openSymptoms}
            notify={notify}
          />
        );
      case 'medical':
        return <Medical navigate={navigate} addDocument={addDocument} />;
      case 'recipes':
        return (
          <MedicationsScreen
            onBack={() => navigate('medical')}
            onChat={() => navigate('chat')}
            notify={notify}
          />
        );
      case 'certificates':
        return (
          <Certificates
            onBack={() => navigate('medical')}
            notify={notify}
            addOnOpen={documentToAdd === 'certificates'}
          />
        );
      case 'record':
        return <MedicalRecord onBack={() => navigate('medical')} navigate={navigate} />;
      case 'labs':
        return (
          <Labs
            notify={notify}
            addOnOpen={documentToAdd === 'labs'}
            onChat={() => {
              navigate('chat');
              setAssistantEntry('labs');
            }}
          />
        );
      case 'profile':
        return (
          <Profile
            onBack={() => navigate('home')}
            notify={notify}
            onClear={assistant.resetAccess}
          />
        );
      case 'chat':
        return <AssistantScreen assistant={assistant} startWithLabs={assistantEntry === 'labs'} />;
    }
  }

  return (
    <View style={styles.stage}>
      <StatusBar barStyle="dark-content" backgroundColor={colors.background} />
      <SafeAreaView style={styles.app} edges={['top', 'left', 'right']}>
        {!ready ? (
          <Loading />
        ) : (
          <>
            {!!storageError && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Повторить сохранение"
                onPress={retrySave}
                style={styles.error}
              >
                <AppText accessibilityRole="alert" style={styles.errorText}>
                  {storageError}
                </AppText>
              </Pressable>
            )}
            <View style={styles.content} key={route}>
              {renderScreen()}
            </View>
            <BottomTabs route={route} navigate={navigate} />
            {!!toast && (
              <View style={styles.toast}>
                <AppText accessibilityLiveRegion="polite" style={styles.toastText}>
                  {toast}
                </AppText>
                {action && (
                  <Pressable
                    accessibilityRole="button"
                    onPress={action.onPress}
                    style={styles.toastAction}
                  >
                    <AppText style={styles.undo}>{action.label}</AppText>
                  </Pressable>
                )}
              </View>
            )}
          </>
        )}
      </SafeAreaView>
      {editor && (
        <SymptomEditor date={editor.date} onClose={() => setEditor(null)} onSaved={notify} />
      )}
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AppProvider>
        <ApplicationContent />
      </AppProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  stage: { flex: 1, backgroundColor: colors.background },
  app: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1 },
  error: { backgroundColor: colors.red, padding: 12 },
  errorText: { fontSize: 12, lineHeight: 18, color: colors.redDark },
  toast: {
    position: 'absolute',
    bottom: 95,
    left: 23,
    right: 23,
    backgroundColor: colors.purpleDark,
    paddingHorizontal: 15,
    paddingVertical: 6,
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 17,
  },
  toastText: { color: colors.white, fontSize: 13, flex: 1, lineHeight: 19 },
  toastAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  undo: { color: colors.white, fontWeight: '600', fontSize: 13 },
});

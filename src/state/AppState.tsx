import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState as NativeAppState } from 'react-native';
import { dateKey, parseUserData, makeInitialData, UserData } from '../domain/cycle';

export const STORAGE_KEY = 'luna.local-demo.v1';
type State = {
  data: UserData;
  today: string;
  ready: boolean;
  storageError: string;
  update: (fn: (d: UserData) => UserData) => boolean;
  clear: () => void;
  retrySave: () => void;
};
const Context = createContext<State | null>(null);
export function AppProvider({ children }: { children: React.ReactNode }) {
  const [today, setToday] = useState(dateKey());
  const [data, setData] = useState(() => makeInitialData());
  const [ready, setReady] = useState(false);
  const [storageError, setError] = useState('');
  const pending = useRef(Promise.resolve());
  const blockWrite = useRef(false);
  useEffect(() => {
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active) return;
        if (raw) {
          const parsed = parseUserData(JSON.parse(raw));
          if (!parsed) throw new Error('Invalid stored data');
          setData(parsed);
        }
      })
      .catch(() => {
        if (active) {
          blockWrite.current = true;
          setError('Не удалось прочитать записи. Исходные данные не перезаписаны.');
        }
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const interval = setInterval(() => setToday(dateKey()), 60000);
    const subscription = NativeAppState.addEventListener('change', (state) => {
      if (state === 'active') setToday(dateKey());
    });
    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
  function persist(next: UserData) {
    pending.current = pending.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)))
      .then(() => setError(''))
      .catch(() => setError('Не удалось сохранить изменения на устройстве. Повторите сохранение.'));
  }
  useEffect(() => {
    if (ready && !blockWrite.current) persist(data);
  }, [data, ready]);
  const update = (fn: (d: UserData) => UserData) => {
    if (blockWrite.current) return false;
    setData(fn);
    return true;
  };
  const clear = () => {
    blockWrite.current = false;
    setData(makeInitialData());
  };
  const retrySave = () => {
    if (!blockWrite.current) {
      persist(data);
      return;
    }
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        const parsed = parseUserData(raw ? JSON.parse(raw) : makeInitialData());
        if (!parsed) throw new Error('Invalid stored data');
        blockWrite.current = false;
        setData(parsed);
        setError('');
      })
      .catch(() =>
        setError('Записи недоступны. Повторите попытку или удалите локальные данные в профиле.'),
      );
  };
  return (
    <Context.Provider value={{ data, today, ready, storageError, update, clear, retrySave }}>
      {children}
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider missing');
  return value;
}

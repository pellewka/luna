import * as SecureStore from 'expo-secure-store';
import { normalizeServerUrl } from './api';
import { Connection } from './types';

const KEY = 'luna.assistant.connection';

export async function readConnection(): Promise<Connection | null> {
  const raw = await SecureStore.getItemAsync(KEY);
  if (!raw) return null;
  const saved: unknown = JSON.parse(raw);
  if (!saved || typeof saved !== 'object') throw new Error('Invalid saved connection');
  const { baseUrl, token } = saved as Connection;
  if (typeof baseUrl !== 'string' || typeof token !== 'string') {
    throw new Error('Invalid saved connection');
  }
  return { baseUrl: normalizeServerUrl(baseUrl), token };
}

export async function saveConnection(connection: Connection): Promise<void> {
  await SecureStore.setItemAsync(KEY, JSON.stringify(connection), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
}

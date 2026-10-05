import type { IconName } from '../components/ui';

export type Tab = 'home' | 'calendar' | 'medical' | 'labs' | 'chat';
export type Route = Tab | 'profile' | 'recipes' | 'certificates' | 'record';
export type Navigate = (route: Route) => void;

export const tabs: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'home', label: 'Главная' },
  { id: 'calendar', icon: 'calendar', label: 'Календарь' },
  { id: 'medical', icon: 'folder', label: 'Здоровье' },
  { id: 'labs', icon: 'lab', label: 'Анализы' },
  { id: 'chat', icon: 'sparkles', label: 'Помощник' },
];

export function parentRoute(route: Route): Tab {
  if (['recipes', 'certificates', 'record'].includes(route)) return 'medical';
  if (route === 'profile') return 'home';
  return route as Tab;
}

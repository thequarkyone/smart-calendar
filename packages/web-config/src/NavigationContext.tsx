import { createContext, useContext } from 'react';

export type SectionId =
  | 'screens' | 'calendars' | 'weather' | 'photos' | 'feeds' | 'ha'
  | 'schedules' | 'displays' | 'templates' | 'todo' | 'tiles' | 'settings'
  | 'theme' | 'support' | 'preview' | 'system';

export const NavigationContext = createContext<(id: SectionId) => void>(() => {});

export function useNavigate() {
  return useContext(NavigationContext);
}

// Тема оформления: 'light' | 'dark' | 'system'.
// Выбор хранится в data-theme на <html>; 'system' разрешается медиа-запросом в CSS.
export type ThemeChoice = 'light' | 'dark' | 'system';

export const THEME_CHOICES: ThemeChoice[] = ['light', 'dark', 'system'];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function applyTheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return;
  document.documentElement.dataset.theme = choice;
}

export function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export type Theme = 'light' | 'dark' | 'system';

const THEME_KEY = 'axora.theme';

export function isTheme(value: unknown): value is Theme {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function loadTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return isTheme(stored) ? stored : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme: Theme) {
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.theme = theme;
  }
}

export function saveTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Ignore storage failures (e.g. private mode); the theme still applies for the session.
  }
  applyTheme(theme);
}

export function nextTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : theme === 'dark' ? 'system' : 'light';
}

export function themeLabel(theme: Theme) {
  return theme === 'light' ? 'Light' : theme === 'dark' ? 'Dark' : 'System';
}

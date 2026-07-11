import { beforeEach, describe, expect, it } from 'vitest';
import { isTheme, loadTheme, nextTheme, saveTheme, themeLabel } from '../theme';

describe('theme preference', () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it('defaults to light when nothing is stored', () => {
    expect(loadTheme()).toBe('light');
  });

  it('validates stored values and ignores junk', () => {
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('sepia')).toBe(false);
    localStorage.setItem('axora.theme', 'nonsense');
    expect(loadTheme()).toBe('light');
  });

  it('persists and applies the theme to the document element', () => {
    saveTheme('dark');
    expect(loadTheme()).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('cycles light -> dark -> system -> light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('system');
    expect(nextTheme('system')).toBe('light');
  });

  it('labels each theme', () => {
    expect(themeLabel('light')).toBe('Light');
    expect(themeLabel('dark')).toBe('Dark');
    expect(themeLabel('system')).toBe('System');
  });
});

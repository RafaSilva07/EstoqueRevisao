import { UserPreferences } from './api';

export const defaultPreferences: UserPreferences = { theme: 'LIGHT', backgroundColor: null };

export function canvasColor(preferences: UserPreferences): string {
  return preferences.backgroundColor ?? (preferences.theme === 'DARK' ? '#101923' : '#f3f5f6');
}

export function canvasTextColor(hex: string): string {
  const channels = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? '#101923' : '#f7fbff';
}

export function applyUiPreferences(preferences: UserPreferences): void {
  const root = document.documentElement;
  const background = canvasColor(preferences);
  root.dataset.theme = preferences.theme === 'DARK' ? 'dark' : 'light';
  root.style.setProperty('--app-bg', background);
  root.style.setProperty('--canvas-ink', canvasTextColor(background));
}

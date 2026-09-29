// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { applyUiPreferences, canvasTextColor, defaultPreferences } from './ui-preferences';

describe('Preferências visuais', () => {
  afterEach(() => { applyUiPreferences(defaultPreferences); });

  it('aplica o tema escuro e uma cor personalizada ao fundo geral', () => {
    applyUiPreferences({ theme: 'DARK', backgroundColor: '#F4A8C8' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('#F4A8C8');
    expect(document.documentElement.style.getPropertyValue('--canvas-ink')).toBe('#101923');
  });

  it('escolhe texto claro para um fundo escuro e restaura o padrão', () => {
    expect(canvasTextColor('#111827')).toBe('#f7fbff');
    applyUiPreferences(defaultPreferences);
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--app-bg')).toBe('#f3f5f6');
  });
});

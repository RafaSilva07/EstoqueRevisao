import { describe, expect, it } from 'vitest';
import { clampPhotoZoom } from './photo-viewer-state';

describe('visualizador de foto', () => {
  it('limita o zoom entre 100% e 400%', () => {
    expect(clampPhotoZoom(.5)).toBe(1);
    expect(clampPhotoZoom(2.5)).toBe(2.5);
    expect(clampPhotoZoom(8)).toBe(4);
  });
});

export function clampPhotoZoom(value: number): number {
  return Math.min(4, Math.max(1, value));
}

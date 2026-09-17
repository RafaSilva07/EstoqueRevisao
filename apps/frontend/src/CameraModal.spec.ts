import { describe, expect, it, vi } from 'vitest';
import { stopMediaStream } from './camera-utils';

describe('Câmera', () => {
  it('libera todas as trilhas ao fechar ou concluir a captura', () => {
    const stopA = vi.fn(); const stopB = vi.fn();
    stopMediaStream({ getTracks: () => [{ stop: stopA }, { stop: stopB }] } as unknown as MediaStream);
    expect(stopA).toHaveBeenCalledOnce(); expect(stopB).toHaveBeenCalledOnce();
  });
});

import { createContext, useContext } from 'react';

export interface DraftEntry { title: string; dirty: () => boolean; busy: () => boolean; save: () => Promise<void>; discard: () => Promise<void> }
export interface DraftWorkspace {
  scope: string | null;
  setScope: (scope: string | null) => void;
  register: (key: string, entry: DraftEntry) => () => void;
  leave: (action: () => void) => void;
  flush: () => void;
}
export const DraftContext = createContext<DraftWorkspace | null>(null);
export function useDraftWorkspace() { return useContext(DraftContext); }

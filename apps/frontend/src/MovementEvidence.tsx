import { ReactNode, useState } from 'react';

export function MovementEvidence({ initiallyCollapsed = false, children }: { initiallyCollapsed?: boolean; children: ReactNode }) {
  const [visible, setVisible] = useState(!initiallyCollapsed);

  return <div className="movement-item-evidence">
    {initiallyCollapsed ? <button type="button" className="secondary" aria-expanded={visible} onClick={() => setVisible((current) => !current)}>{visible ? 'Ocultar fotos' : 'Mostrar fotos'}</button> : <span className="movement-item-evidence-label">Fotos/evidências</span>}
    {visible && children}
  </div>;
}

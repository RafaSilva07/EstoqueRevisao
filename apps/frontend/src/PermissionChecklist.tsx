import { PermissionOption, togglePermission } from './permission-selection';
export type { PermissionOption, PermissionPreset } from './permission-selection';

export function PermissionChecklist({ options, selected, modes, disabled = false, onChange }: {
  options: PermissionOption[]; selected: string[]; modes: string[]; disabled?: boolean; onChange: (codes: string[]) => void;
}) {
  const visible = options.filter((option) => modes.includes('ADMIN') || option.modes.some((mode) => modes.includes(mode)));
  const groups = [...new Set(visible.map((option) => option.group))];
  return <div className="permission-checklist">
    <p className="muted">Marque as funcionalidades permitidas. Ao liberar uma ação, as leituras necessárias também são marcadas. O setor continua limitando onde ela pode ser usada.</p>
    {groups.map((group) => <fieldset key={group} disabled={disabled}>
      <legend>{group}</legend>
      {visible.filter((option) => option.group === group).map((option) => <label key={option.code}>
        <input type="checkbox" value={option.code} checked={selected.includes(option.code)} onChange={(event) => onChange(togglePermission(options, selected, option.code, event.target.checked))} />
        <span>{option.label}</span>
      </label>)}
    </fieldset>)}
  </div>;
}

import { useId, useRef, useState } from 'react';

interface Option { value: string; label: string }

/** Lista no fluxo do formulário: não ultrapassa o modal nem cobre outros campos. */
export function PositionSelect({ label, value, options, onChange, disabled = false, placeholder = 'Selecione' }: {
  label: string; value: string; options: Option[]; onChange: (value: string) => void;
  disabled?: boolean; placeholder?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value);
  const expanded = open && !disabled;
  function choose(option: Option) { onChange(option.value); setOpen(false); trigger.current?.focus(); }
  function highlight(index: number) {
    setActive(index);
    document.getElementById(`${id}-${index}`)?.scrollIntoView({ block: 'nearest' });
  }
  return <div className="position-select wide" onBlur={(event) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
  }}>
    <span id={`${id}-label`} className="position-select-label">{label}</span>
    <button ref={trigger} type="button" role="combobox" aria-labelledby={`${id}-label`}
      aria-required="true" aria-expanded={expanded} aria-controls={`${id}-list`}
      aria-activedescendant={expanded && options[active] ? `${id}-${active}` : undefined}
      disabled={disabled} className="position-select-trigger" onClick={() => {
        setActive(Math.max(0, options.findIndex((option) => option.value === value))); setOpen(!open);
      }} onKeyDown={(event) => {
        if (event.key === 'Escape' && expanded) { event.preventDefault(); event.stopPropagation(); setOpen(false); }
        else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
          event.preventDefault(); setOpen(true);
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : active + (event.key === 'ArrowDown' ? 1 : -1);
          highlight(Math.max(0, Math.min(options.length - 1, expanded ? next : Math.max(0, options.findIndex((option) => option.value === value)))));
        } else if ((event.key === 'Enter' || event.key === ' ') && expanded) {
          event.preventDefault(); if (options[active]) choose(options[active]);
        } else if (event.key === 'Tab') setOpen(false);
      }}><span>{selected?.label ?? placeholder}</span><span aria-hidden="true">⌄</span></button>
    {expanded && <div id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="position-select-list">
      {!options.length && <span className="muted">Nenhuma posição disponível.</span>}
      {options.map((option, index) => <button key={option.value} id={`${id}-${index}`} type="button" role="option"
        tabIndex={-1} aria-selected={option.value === value} className={index === active ? 'highlighted' : ''}
        onMouseDown={(event) => event.preventDefault()} onClick={() => choose(option)}>{option.label}</button>)}
    </div>}
  </div>;
}

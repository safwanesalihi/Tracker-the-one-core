'use client';

import { useEffect, useRef, useState } from 'react';
import { useI18n } from '@/app/locale-provider';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

type Props = { value?: string; onChange: (value: string) => void; label: string; placeholder?: string };
type Point = { top: number; left: number; width: number };

const pad = (value: number) => String(value).padStart(2, '0');
const keyFor = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromKey = (value?: string) => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day ? date : null;
};
const monthLabel = (date: Date, tag: string) => date.toLocaleDateString(tag, { month: 'long', year: 'numeric' });
const dateLabel = (value: string | undefined, tag: string) => fromKey(value)?.toLocaleDateString(tag, { day: 'numeric', month: 'short', year: 'numeric' }) || '';

function monthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const mondayOffset = (first.getDay() + 6) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first.getFullYear(), first.getMonth(), index - mondayOffset + 1);
    return { date, current: date.getMonth() === month.getMonth() };
  });
}

export default function DatePicker({ value = '', onChange, label, placeholder }: Props) {
  const { t, tag } = useI18n();
  placeholder ??= t('Choisir une date');
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => fromKey(value) || new Date());
  const [point, setPoint] = useState<Point | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const selected = fromKey(value);

  function position() {
    const rect = root.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 294;
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    const estimatedHeight = 390;
    const top = rect.bottom + 8 + estimatedHeight > window.innerHeight && rect.top > estimatedHeight + 8
      ? rect.top - estimatedHeight - 8 : rect.bottom + 8;
    setPoint({ top, left, width: rect.width });
  }

  function toggle() {
    if (!open) { setMonth(selected || new Date()); requestAnimationFrame(position); }
    setOpen(next => !next);
  }

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    const reposition = () => position();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', escape);
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    position();
    return () => {
      document.removeEventListener('mousedown', close); document.removeEventListener('keydown', escape);
      window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true);
    };
  }, [open]);

  return <div className="date-picker" ref={root}>
    <button type="button" className={`date-picker-trigger ${value ? 'has-value' : ''}`} aria-label={label} aria-expanded={open} onClick={toggle}>
      <CalendarDays size={15} /> <span>{dateLabel(value, tag) || placeholder}</span>
    </button>
    {open && point && <div className="date-picker-popover" role="dialog" aria-label={label} style={{ top: point.top, left: point.left, width: Math.max(point.width, 294) }}>
      <header className="date-picker-header">
        <button type="button" className="date-picker-nav" aria-label={t('Mois précédent')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button>
        <strong>{monthLabel(month, tag)}</strong>
        <button type="button" className="date-picker-nav" aria-label={t('Mois suivant')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button>
      </header>
      <div className="date-picker-weekdays">{['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map(day => <span key={day}>{t(day)}</span>)}</div>
      <div className="date-picker-days">{monthDays(month).map(({ date, current }) => {
        const key = keyFor(date); const isSelected = value === key; const isToday = key === keyFor(new Date());
        return <button type="button" key={key} className={`date-picker-day ${current ? '' : 'outside'} ${isToday ? 'today' : ''} ${isSelected ? 'selected' : ''}`} aria-label={date.toLocaleDateString(tag, { dateStyle: 'full' })} aria-pressed={isSelected} onClick={() => { onChange(key); setOpen(false); }}>{date.getDate()}</button>;
      })}</div>
      <footer className="date-picker-footer">
        <button type="button" className="date-picker-today" onClick={() => { const today = keyFor(new Date()); onChange(today); setOpen(false); }}>{t('Aujourd’hui')}</button>
        {value && <button type="button" className="date-picker-clear" aria-label={t('Effacer la date')} onClick={() => { onChange(''); setOpen(false); }}><X size={14} />{' '}{t('Effacer')}</button>}
      </footer>
    </div>}
  </div>;
}

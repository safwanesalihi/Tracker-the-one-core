'use client';

import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/app/locale-provider';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';

type Props = { value?: string; onChange: (value: string) => void; label: string; placeholder?: string };

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
  const { t, tag, rtl } = useI18n();
  placeholder ??= t('Choisir une date');
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => fromKey(value) || new Date());
  const selected = fromKey(value);
  function changeOpen(next: boolean) { if (next) setMonth(selected || new Date()); setOpen(next); }

  return <Popover open={open} onOpenChange={changeOpen}><div className="date-picker">
    <PopoverTrigger asChild>
    <button type="button" className={`date-picker-trigger ${value ? 'has-value' : ''}`} aria-label={label} aria-expanded={open} >
      <CalendarDays size={15} /> <span>{dateLabel(value, tag) || placeholder}</span>
    </button></PopoverTrigger>
    <PopoverContent className="date-picker-popover" align="start" sideOffset={8} collisionPadding={12} aria-label={label} dir={rtl ? "rtl" : "ltr"}>
      <header className="date-picker-header">
        <button type="button" className="date-picker-nav" aria-label={t('Mois précédent')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>{rtl ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}</button>
        <strong>{monthLabel(month, tag)}</strong>
        <button type="button" className="date-picker-nav" aria-label={t('Mois suivant')} onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>{rtl ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}</button>
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
    </PopoverContent>
  </div></Popover>;
}

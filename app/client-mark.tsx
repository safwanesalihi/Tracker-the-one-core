'use client';
// A client's visual identity: its logo when one was uploaded, otherwise its initials.
import { initials } from '@/lib/model';

export default function ClientMark({ name, logo, size = 'md', className = '' }: { name: string; logo?: string; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  return <span className={`client-mark client-mark-${size} ${logo ? 'has-logo' : ''} ${className}`} title={name}>
    {logo ? <img src={`/api/assets/${logo}`} alt={`Logo ${name}`} /> : initials(name)}
  </span>;
}
